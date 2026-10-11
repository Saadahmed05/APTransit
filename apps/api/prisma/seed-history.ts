/* eslint-disable no-console */
import {
  calculateFare,
  CROCKFORD_ALPHABET,
  formatIstDate,
  localTimeToUtc,
  utcToIstParts,
} from "@aptransit/shared";
import { sealSecret } from "../src/common/crypto/secret-box";
import type { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { RollupsService } from "../src/modules/rollups/rollups.service";
import { generateTripsForTimetables, type TimetableInput } from "../src/modules/trips/trip-generator";
import type { PrismaService } from "../src/prisma/prisma.service";

// History for analytics and dashboards (docs/19 "History"). Everything comes from one fixed seed,
// so two runs on the same day produce the same rows. The generator owns the past `days` service
// dates and the synthetic citizens: a rerun deletes what an earlier run made there and writes it again.

const SEED = 20260923;
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const BATCH = 5000;

/** Mulberry32: small, fast and deterministic. */
function createPrng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = ReturnType<typeof createPrng>;

const int = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)]!;

/** Lowercase id that passes the PublicId check (like cuid2, but reproducible). */
function idMaker(rng: Rng) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  return () => {
    let out = "h";
    for (let i = 0; i < 23; i++) out += alphabet[Math.floor(rng() * alphabet.length)];
    return out;
  };
}

/** Codes in the shared formats (codes.ts), unique within the run. */
function codeMaker(rng: Rng) {
  const used = new Set<string>();
  const part = (n: number) => {
    let out = "";
    for (let i = 0; i < n; i++) out += CROCKFORD_ALPHABET[Math.floor(rng() * CROCKFORD_ALPHABET.length)];
    return out;
  };
  return {
    ticket: () => unique(() => `APT-${part(4)}-${part(4)}`),
    booking: () => unique(() => `BKG-${part(6)}`),
    pass: () => unique(() => `PAS-${part(6)}`),
    complaint: () => unique(() => `CMP-${part(6)}`),
    incident: () => unique(() => `INC-${part(6)}`),
  };
  function unique(make: () => string): string {
    for (;;) {
      const code = make();
      if (!used.has(code)) {
        used.add(code);
        return code;
      }
    }
  }
}

const PAYMENT_TYPES = { amountPaise: "int4", status: '"PaymentStatus"', capturedAt: "timestamp" };

const BASE_TYPES = new Set(["text", "int4", "float8", "bool", "timestamp"]);

/**
 * Bulk insert with one array parameter per column (INSERT ... SELECT FROM unnest). createMany sends
 * one parameter per value and manages about 1,000 rows a second; this is two orders faster, which
 * keeps the history under the 2 minute budget on Neon. `types` names every column that is not text
 * (enums by their quoted type name). Tables with `updatedAt` get it from `createdAt`.
 */
async function bulkInsert(
  prisma: PrismaClient,
  table: string,
  rows: ReadonlyArray<object>,
  types: Record<string, string>,
  hasUpdatedAt: boolean,
): Promise<void> {
  if (!rows.length) return;
  const keys = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row)) keys.add(key);
  if (hasUpdatedAt) keys.add("updatedAt");
  const columns = [...keys];
  const typeOf = (c: string) => (c === "updatedAt" || c === "createdAt" ? "timestamp" : (types[c] ?? "text"));
  const params = columns.map((c, j) => `$${j + 1}::${BASE_TYPES.has(typeOf(c)) ? typeOf(c) : "text"}[]`);
  const select = columns.map((c, j) => (BASE_TYPES.has(typeOf(c)) ? `u.c${j}` : `u.c${j}::${typeOf(c)}`));
  const sql = `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(", ")}) SELECT ${select.join(", ")} FROM unnest(${params.join(", ")}) AS u(${columns.map((_, j) => `c${j}`).join(", ")})`;
  const value = (v: unknown) => (v instanceof Date ? v.toISOString() : typeof v === "bigint" ? String(v) : (v ?? null));
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH) as Array<Record<string, unknown>>;
    const arrays = columns.map((c) =>
      chunk.map((r) => value(c === "updatedAt" && r[c] === undefined ? (r.createdAt ?? new Date()) : r[c])),
    );
    await prisma.$executeRawUnsafe(sql, ...arrays);
  }
}

/** Load factor for one trip (docs/19): 40 to 70 percent, more at the morning and evening peaks, KNL-TPT busier at weekends. */
function loadFactor(rng: Rng, routeCode: string, istHour: number, weekday: number): number {
  let lf = 0.4 + rng() * 0.3;
  if ((istHour >= 7 && istHour <= 10) || (istHour >= 17 && istHour <= 20)) lf += 0.2;
  if (routeCode.startsWith("KNL-TPT") && (weekday === 0 || weekday === 6)) lf += 0.15;
  return Math.min(0.95, lf);
}

/** Delay for one completed trip (docs/19): mostly 0 to 10 min, 10 to 30 on the evening peak of KNL-VJA and VJA-GNT. */
function delayFor(rng: Rng, routeCode: string, istHour: number): number {
  const peakRoute = routeCode.startsWith("KNL-VJA") || routeCode.startsWith("VJA-GNT");
  if (peakRoute && istHour >= 17 && istHour <= 20) return int(rng, 10, 30);
  return int(rng, 0, 10);
}

const FIRST_NAMES = ["Ravi", "Lakshmi", "Suresh", "Padma", "Kiran", "Sravani", "Mahesh", "Anitha", "Naveen", "Swathi"];

const COMPLAINT_TEXT: Record<string, string> = {
  DELAY: "The bus left the stand much later than the time shown in the app.",
  CLEANLINESS: "Seats near the back were dirty and the floor was not cleaned.",
  STAFF: "The conductor was rude when I asked about my stop.",
  TICKET: "My ticket showed as used before I boarded the bus.",
  SAFETY: "The driver was using a phone while driving on the highway.",
  OVERCROWDING: "Many standing passengers on a reserved service, hard to reach my seat.",
  OTHER: "The display at the bus stand showed the wrong platform.",
};

const RESOLUTION_NOTES = [
  "Spoke with the crew and shared the feedback. Thank you for reporting.",
  "Depot manager reviewed the trip log and corrected the schedule display.",
  "Cleaning checklist updated for this service. Bus cleaned before the next trip.",
];

interface HistoryTrip {
  id: string;
  code: string;
  timetableId: string;
  routeId: string;
  routeCode: string;
  depotId: string;
  busTypeId: string;
  serviceDateStr: string;
  scheduledDepartureAt: Date;
  scheduledArrivalAt: Date;
  status: "COMPLETED" | "CANCELLED";
  delayMinutes: number;
  busId: string;
  driverId: string;
  conductorId: string;
}

export async function generateHistory(prisma: PrismaClient, days = 14, now = new Date()): Promise<void> {
  const started = Date.now();
  const step = (label: string) => console.log(`  ${((Date.now() - started) / 1000).toFixed(1)} s ${label}`);
  const rng = createPrng(SEED);
  const newId = idMaker(rng);
  const codes = codeMaker(rng);
  const qrKey = process.env.QR_SECRET_KEY;
  if (!qrKey) throw new Error("QR_SECRET_KEY is required to seal ticket and pass secrets");
  const secret = () => sealSecret(Buffer.from(Array.from({ length: 32 }, () => int(rng, 0, 255))), qrKey);

  const todayStr = formatIstDate(now);
  const firstStr = formatIstDate(new Date(now.getTime() - days * DAY));
  const lastStr = formatIstDate(new Date(now.getTime() - DAY));
  const firstDate = new Date(`${firstStr}T00:00:00.000Z`);
  const todayDate = new Date(`${todayStr}T00:00:00.000Z`);
  console.log(`History: ${days} days, ${firstStr} to ${lastStr} (seed ${SEED})`);

  // 1. Reference data from the base seed
  const [routes, timetables, busTypes, buses, drivers, conductors, passTypes, refundPolicy, manager] = await Promise.all([
    prisma.route.findMany({
      include: { routeStops: { orderBy: { seq: "asc" }, include: { stop: { select: { lat: true, lng: true } } } } },
    }),
    prisma.timetable.findMany({ where: { isActive: true } }),
    prisma.busType.findMany({ include: { fareRules: { orderBy: { validFrom: "desc" } } } }),
    prisma.bus.findMany({ orderBy: { regNo: "asc" } }),
    prisma.driver.findMany({ orderBy: { employeeCode: "asc" } }),
    prisma.conductor.findMany({ orderBy: { employeeCode: "asc" } }),
    prisma.passType.findMany(),
    prisma.refundPolicy.findFirst({ where: { isActive: true }, orderBy: { validFrom: "desc" } }),
    prisma.user.findUnique({ where: { email: "manager.knl@aptransit.test" } }),
  ]);
  if (!routes.length || !timetables.length || !drivers.length || !conductors.length || !refundPolicy || !manager) {
    console.log("Base data missing (routes, timetables, staff, refund policy or manager). Run pnpm db:seed first.");
    return;
  }
  const routeById = new Map(routes.map((r) => [r.id, r]));
  const busTypeById = new Map(busTypes.map((b) => [b.id, b]));

  // 2. Remove an earlier run (past service dates and synthetic citizens only)
  const oldTrips = (
    await prisma.trip.findMany({ where: { serviceDate: { gte: firstDate, lt: todayDate } }, select: { id: true } })
  ).map((t) => t.id);
  const synthetic = (
    await prisma.user.findMany({ where: { email: { startsWith: "citizen+" } }, select: { id: true } })
  ).map((u) => u.id);
  const oldPasses = (await prisma.pass.findMany({ where: { userId: { in: synthetic } }, select: { id: true } })).map(
    (p) => p.id,
  );
  if (oldTrips.length || oldPasses.length) {
    console.log(`Removing an earlier history run: ${oldTrips.length} trips, ${oldPasses.length} passes`);
    const tripTickets = { ticket: { tripId: { in: oldTrips } } };
    const tripBookings = { booking: { tripId: { in: oldTrips } } };
    await prisma.ticketScan.deleteMany({ where: { OR: [{ tripId: { in: oldTrips } }, { passId: { in: oldPasses } }] } });
    await prisma.refund.deleteMany({ where: { OR: [tripTickets, { payment: tripBookings }, { payment: { passId: { in: oldPasses } } }] } });
    await prisma.ticketTransfer.deleteMany({ where: tripTickets });
    await prisma.ticket.deleteMany({ where: { tripId: { in: oldTrips } } });
    await prisma.pass.updateMany({ where: { id: { in: oldPasses } }, data: { paymentId: null } });
    await prisma.payment.deleteMany({ where: { OR: [tripBookings, { passId: { in: oldPasses } }] } });
    await prisma.booking.deleteMany({ where: { tripId: { in: oldTrips } } });
    await prisma.pass.deleteMany({ where: { id: { in: oldPasses } } });
    await prisma.eligibilityCheck.deleteMany({ where: { userId: { in: synthetic } } });
    await prisma.complaint.deleteMany({ where: { email: { startsWith: "citizen+" } } });
    await prisma.gpsLocation.deleteMany({ where: { tripId: { in: oldTrips } } });
    await prisma.incident.deleteMany({ where: { tripId: { in: oldTrips } } });
    await prisma.tripAssignment.deleteMany({ where: { tripId: { in: oldTrips } } });
    await prisma.notification.deleteMany({ where: { userId: { in: synthetic } } });
    await prisma.maintenanceRecord.deleteMany({ where: { kind: { startsWith: "History " } } });
    await prisma.trip.deleteMany({ where: { id: { in: oldTrips } } });
  }

  step("cleanup done");
  // 3. 200 synthetic citizens
  await prisma.user.createMany({
    data: Array.from({ length: 200 }, (_, i) => {
      const n = String(i + 1).padStart(3, "0");
      return {
        email: `citizen+${n}@aptransit.test`,
        name: `${FIRST_NAMES[i % FIRST_NAMES.length]} ${n}`,
        preferredLocale: i % 3 === 0 ? "te" : "en",
      };
    }),
    skipDuplicates: true,
  });
  const citizens = await prisma.user.findMany({
    where: { email: { startsWith: "citizen+" } },
    orderBy: { email: "asc" },
    select: { id: true, email: true, name: true },
  });
  // The last 60 citizens hold the free travel passes (and so travel on FREE_TRAVEL tickets)
  const freeTravellers = citizens.slice(-60);
  const payingCitizens = citizens.slice(0, citizens.length - 60);

  // 4. Trips from the timetables, same generator and codes as the daily job
  const inputs: TimetableInput[] = timetables
    .flatMap((tt): TimetableInput[] => {
      const route = routeById.get(tt.routeId);
      if (!route) return [];
      return [{
        id: tt.id,
        routeId: tt.routeId,
        routeCode: route.code,
        busTypeId: tt.busTypeId,
        departureLocal: tt.departureLocal,
        daysMask: tt.daysMask,
        validFrom: tt.validFrom,
        validTo: tt.validTo,
        isActive: tt.isActive,
        durationMinutes: route.routeStops.at(-1)?.minutesFromOrigin ?? 0,
      }];
    })
    .sort((a, b) => `${a.routeCode}${a.departureLocal}`.localeCompare(`${b.routeCode}${b.departureLocal}`));
  const generated = generateTripsForTimetables(inputs, firstStr, lastStr);

  const depotBuses = new Map<string, typeof buses>();
  for (const b of buses) depotBuses.set(b.depotId, [...(depotBuses.get(b.depotId) ?? []), b]);
  const breakdownBus = buses.find((b) => b.status === "BREAKDOWN");
  const busTurn = new Map<string, number>();
  const pickBus = (depotId: string, busTypeId: string) => {
    const pool = depotBuses.get(depotId) ?? buses;
    const sameType = pool.filter((b) => b.busTypeId === busTypeId);
    const list = sameType.length ? sameType : pool;
    const key = `${depotId}:${list === sameType ? busTypeId : "*"}`;
    const turn = busTurn.get(key) ?? 0;
    busTurn.set(key, turn + 1);
    return list[turn % list.length]!;
  };
  const crewTurn = new Map<string, number>();
  const pickCrew = <T extends { depotId: string }>(list: readonly T[], depotId: string, kind: string): T => {
    const own = list.filter((x) => x.depotId === depotId);
    const pool = own.length ? own : list;
    const turn = crewTurn.get(`${kind}${depotId}`) ?? 0;
    crewTurn.set(`${kind}${depotId}`, turn + 1);
    return pool[turn % pool.length]!;
  };

  const trips: HistoryTrip[] = generated.map((g) => {
    const route = routeById.get(g.routeId)!;
    const istHour = utcToIstParts(g.scheduledDepartureAt).hours;
    const cancelled = rng() < 0.03;
    const depotId = route.depotId;
    return {
      id: newId(),
      code: g.code,
      timetableId: g.timetableId,
      routeId: g.routeId,
      routeCode: route.code,
      depotId,
      busTypeId: g.busTypeId,
      serviceDateStr: g.serviceDateStr,
      scheduledDepartureAt: g.scheduledDepartureAt,
      scheduledArrivalAt: g.scheduledArrivalAt,
      status: cancelled ? "CANCELLED" : "COMPLETED",
      delayMinutes: cancelled ? 0 : delayFor(rng, route.code, istHour),
      busId: pickBus(depotId, g.busTypeId).id,
      driverId: pickCrew(drivers, depotId, "d").id,
      conductorId: pickCrew(conductors, depotId, "c").id,
    };
  });

  // The one open breakdown (docs/19): yesterday's last KNL-VJA-01 trip, on the bus that is still in BREAKDOWN
  const breakdownTrip = trips
    .filter((t) => t.serviceDateStr === lastStr && t.routeCode === "KNL-VJA-01" && t.status === "COMPLETED")
    .at(-1);
  if (breakdownTrip && breakdownBus) breakdownTrip.busId = breakdownBus.id;

  await bulkInsert(
    prisma,
    "trips",
    trips.map((t) => ({
      id: t.id,
      code: t.code,
      timetableId: t.timetableId,
      routeId: t.routeId,
      busTypeId: t.busTypeId,
      serviceDate: new Date(`${t.serviceDateStr}T00:00:00.000Z`),
      scheduledDepartureAt: t.scheduledDepartureAt,
      scheduledArrivalAt: t.scheduledArrivalAt,
      actualDepartureAt: t.status === "COMPLETED" ? new Date(t.scheduledDepartureAt.getTime() + t.delayMinutes * MIN) : null,
      actualArrivalAt: t.status === "COMPLETED" ? new Date(t.scheduledArrivalAt.getTime() + t.delayMinutes * MIN) : null,
      status: t.status,
      delayMinutes: t.delayMinutes,
      lastStopSeq: t.status === "COMPLETED" ? (routeById.get(t.routeId)!.routeStops.at(-1)?.seq ?? null) : null,
      hasOpenIncident: t === breakdownTrip,
      createdAt: new Date(t.scheduledDepartureAt.getTime() - 7 * DAY),
    })),
    {
      serviceDate: "timestamp",
      scheduledDepartureAt: "timestamp",
      scheduledArrivalAt: "timestamp",
      actualDepartureAt: "timestamp",
      actualArrivalAt: "timestamp",
      status: '"TripStatus"',
      delayMinutes: "int4",
      lastStopSeq: "int4",
      hasOpenIncident: "bool",
    },
    true,
  );
  console.log(`Trips: ${trips.length} (${trips.filter((t) => t.status === "CANCELLED").length} cancelled)`);

  step("trips inserted");
  // 5. Assignments: the bus and crew that ran each trip (the breakdown trip finished on a replacement bus)
  const assignments: Prisma.TripAssignmentCreateManyInput[] = [];
  for (const t of trips) {
    const start = new Date(t.scheduledDepartureAt.getTime() + t.delayMinutes * MIN);
    const end = t.status === "COMPLETED" ? new Date(t.scheduledArrivalAt.getTime() + t.delayMinutes * MIN) : t.scheduledDepartureAt;
    if (t === breakdownTrip) {
      const brokeAt = new Date(start.getTime() + 95 * MIN);
      const replacement = (depotBuses.get(t.depotId) ?? []).find((b) => b.status === "IDLE" && b.id !== t.busId) ?? buses[0]!;
      assignments.push(
        { id: newId(), tripId: t.id, busId: t.busId, driverId: t.driverId, conductorId: t.conductorId, reason: "INITIAL", assignedById: manager.id, startedAt: start, endedAt: brokeAt, createdAt: start },
        { id: newId(), tripId: t.id, busId: replacement.id, driverId: t.driverId, conductorId: t.conductorId, reason: "REPLACEMENT", assignedById: manager.id, startedAt: new Date(brokeAt.getTime() + 40 * MIN), endedAt: end, createdAt: brokeAt },
      );
      continue;
    }
    assignments.push({
      id: newId(),
      tripId: t.id,
      busId: t.busId,
      driverId: t.driverId,
      conductorId: t.conductorId,
      reason: "INITIAL",
      assignedById: manager.id,
      startedAt: start,
      endedAt: end,
      createdAt: new Date(t.scheduledDepartureAt.getTime() - DAY),
    });
  }
  await bulkInsert(prisma, "trip_assignments", assignments, { reason: '"AssignmentReason"', startedAt: "timestamp", endedAt: "timestamp" }, false);

  // 6. Bookings, payments, tickets and scans
  const bookings: Prisma.BookingCreateManyInput[] = [];
  const passengers: Prisma.BookingPassengerCreateManyInput[] = [];
  const payments: Prisma.PaymentCreateManyInput[] = [];
  const tickets: Prisma.TicketCreateManyInput[] = [];
  const refunds: Prisma.RefundCreateManyInput[] = [];
  const scans: Prisma.TicketScanCreateManyInput[] = [];
  let paymentNo = 0;

  for (const t of trips) {
    const route = routeById.get(t.routeId)!;
    const busType = busTypeById.get(t.busTypeId)!;
    const rule = busType.fareRules.find((r) => r.validFrom <= t.scheduledDepartureAt) ?? busType.fareRules.at(-1);
    if (!rule) continue;
    const stops = route.routeStops;
    const ist = utcToIstParts(t.scheduledDepartureAt);
    const weekday = new Date(`${t.serviceDateStr}T12:00:00.000Z`).getUTCDay();
    const lf = loadFactor(rng, route.code, ist.hours, weekday) * (t.status === "CANCELLED" ? 0.6 : 1);
    let remaining = Math.round(busType.totalSeats * lf);
    let seat = 1;
    const departed = new Date(t.scheduledDepartureAt.getTime() + t.delayMinutes * MIN);

    while (remaining > 0) {
      const freeTravel = busType.freeTravelEligible && rng() < 0.2;
      const size = freeTravel ? 1 : Math.min(remaining, rng() < 0.6 ? 1 : rng() < 0.75 ? 2 : 3);
      remaining -= size;
      const fullRoute = rng() < 0.55 || stops.length < 3;
      const board = fullRoute ? 0 : int(rng, 0, stops.length - 2);
      const drop = fullRoute ? stops.length - 1 : int(rng, board + 1, stops.length - 1);
      const from = stops[board]!;
      const to = stops[drop]!;
      const fare = calculateFare({
        distanceKm: to.kmFromOrigin - from.kmFromOrigin,
        rule,
        isFreeTravel: freeTravel,
      }).totalPaise;
      const user = freeTravel ? pick(rng, freeTravellers) : pick(rng, payingCitizens);
      const bookedAt = new Date(t.scheduledDepartureAt.getTime() - int(rng, 30, 72 * 60) * MIN);
      const bookingId = newId();
      bookings.push({
        id: bookingId,
        code: codes.booking(),
        userId: user.id,
        tripId: t.id,
        boardingStopId: from.stopId,
        droppingStopId: to.stopId,
        status: "CONFIRMED",
        totalPaise: fare * size,
        holdExpiresAt: new Date(bookedAt.getTime() + 10 * MIN),
        createdAt: bookedAt,
      });
      let paymentId: string | null = null;
      if (!freeTravel) {
        paymentNo++;
        paymentId = newId();
        payments.push({
          id: paymentId,
          bookingId,
          providerOrderId: `order_hist_${String(paymentNo).padStart(7, "0")}`,
          providerPaymentId: `pay_hist_${String(paymentNo).padStart(7, "0")}`,
          amountPaise: fare * size,
          status: t.status === "CANCELLED" ? "REFUNDED" : "CAPTURED",
          capturedAt: new Date(bookedAt.getTime() + 2 * MIN),
          createdAt: bookedAt,
        });
      }

      const boardAt = new Date(departed.getTime() + from.minutesFromOrigin * MIN);
      for (let p = 0; p < size; p++) {
        const passengerId = newId();
        passengers.push({
          id: passengerId,
          bookingId,
          name: p === 0 ? (user.name ?? "Passenger") : `${pick(rng, FIRST_NAMES)} ${user.name?.split(" ")[1] ?? ""}`.trim(),
          age: int(rng, 18, 70),
          gender: freeTravel ? "F" : pick(rng, ["M", "F"] as const),
          seatNo: String(seat++),
          createdAt: bookedAt,
        });
        const ticketId = newId();
        const noShow = t.status === "COMPLETED" && rng() < 0.05;
        const status = t.status === "CANCELLED" ? "REFUNDED" : noShow ? "EXPIRED" : "USED";
        const scannedAt = status === "USED" ? new Date(boardAt.getTime() + int(rng, 0, 5) * MIN) : null;
        tickets.push({
          id: ticketId,
          code: codes.ticket(),
          bookingId,
          passengerId,
          type: freeTravel ? "FREE_TRAVEL" : "SINGLE",
          status,
          holderUserId: user.id,
          originalUserId: user.id,
          tripId: t.id,
          routeId: t.routeId,
          boardingStopId: from.stopId,
          droppingStopId: to.stopId,
          seatNo: String(seat - 1),
          farePaise: fare,
          activatedAt: scannedAt ? new Date(scannedAt.getTime() - int(rng, 5, 30) * MIN) : null,
          validUntil: scannedAt ? new Date(t.scheduledArrivalAt.getTime() + (t.delayMinutes + 60) * MIN) : null,
          scannedAt,
          usedAt: scannedAt ? new Date(departed.getTime() + to.minutesFromOrigin * MIN) : null,
          expiresAt: new Date(t.scheduledDepartureAt.getTime() + (from.minutesFromOrigin + 30) * MIN),
          qrSecret: secret(),
          giftable: !freeTravel,
          createdAt: bookedAt,
        });
        if (scannedAt) {
          scans.push({ id: newId(), ticketId, tripId: t.id, conductorId: t.conductorId, result: "VALID", reason: "OK", scannedAt, createdAt: scannedAt });
          if (rng() < 0.005) {
            const again = new Date(scannedAt.getTime() + int(rng, 1, 20) * MIN);
            scans.push({ id: newId(), ticketId, tripId: t.id, conductorId: t.conductorId, result: "INVALID", reason: "ALREADY_SCANNED", scannedAt: again, createdAt: again });
          }
        }
        if (t.status === "CANCELLED" && paymentId) {
          // Operator cancellation: full refund including fees (docs/07 section 6)
          refunds.push({
            id: newId(),
            paymentId,
            ticketId,
            amountPaise: fare,
            status: "PROCESSED",
            providerRefundId: `rfnd_hist_${ticketId}`,
            policyId: refundPolicy.id,
            reason: "OPERATOR_CANCELLED",
            processedAt: new Date(t.scheduledDepartureAt.getTime() - HOUR),
            createdAt: new Date(t.scheduledDepartureAt.getTime() - 2 * HOUR),
          });
        }
      }
    }
  }

  step("tickets built in memory");
  await bulkInsert(prisma, "bookings", bookings, { status: '"BookingStatus"', totalPaise: "int4", holdExpiresAt: "timestamp" }, true);
  await bulkInsert(prisma, "booking_passengers", passengers, { age: "int4", gender: '"Gender"' }, false);
  await bulkInsert(prisma, "payments", payments, PAYMENT_TYPES, true);
  step("bookings, passengers, payments inserted");
  await bulkInsert(prisma, "tickets", tickets, { type: '"TicketType"', status: '"TicketStatus"', farePaise: "int4", activatedAt: "timestamp", validUntil: "timestamp", scannedAt: "timestamp", usedAt: "timestamp", expiresAt: "timestamp", giftable: "bool" }, true);
  await bulkInsert(prisma, "refunds", refunds, { amountPaise: "int4", status: '"RefundStatus"', processedAt: "timestamp" }, true);
  console.log(`Bookings: ${bookings.length}, tickets: ${tickets.length}, payments: ${payments.length}, refunds: ${refunds.length}`);

  step("tickets and refunds inserted");
  // 7. Passes: 30 weekly and 20 monthly active (paid), 60 free travel (Stree Shakti, checked eligible).
  // Plus 25 weekly passes that ended earlier in the window, so passesActive moves from day to day.
  const weekly = passTypes.find((p) => p.kind === "WEEKLY");
  const monthly = passTypes.find((p) => p.kind === "MONTHLY");
  const free = passTypes.find((p) => p.kind === "FREE_TRAVEL");
  const todayStart = localTimeToUtc(todayStr, "00:00");
  const passRows: Prisma.PassCreateManyInput[] = [];
  const passPayments: Prisma.PaymentCreateManyInput[] = [];
  const eligibility: Prisma.EligibilityCheckCreateManyInput[] = [];
  const addPass = (type: (typeof passTypes)[number], userId: string, startDaysAgo: number) => {
    const validFrom = new Date(todayStart.getTime() - startDaysAgo * DAY);
    const validUntil = new Date(validFrom.getTime() + type.durationDays * DAY - 1000);
    const id = newId();
    let paymentId: string | null = null;
    let eligibilityCheckId: string | null = null;
    if (type.pricePaise > 0) {
      paymentNo++;
      paymentId = newId();
      passPayments.push({
        id: paymentId,
        passId: id,
        providerOrderId: `order_hist_${String(paymentNo).padStart(7, "0")}`,
        providerPaymentId: `pay_hist_${String(paymentNo).padStart(7, "0")}`,
        amountPaise: type.pricePaise,
        status: "CAPTURED",
        capturedAt: new Date(validFrom.getTime() - HOUR),
        createdAt: new Date(validFrom.getTime() - HOUR),
      });
    }
    if (type.scheme) {
      eligibilityCheckId = newId();
      eligibility.push({
        id: eligibilityCheckId,
        userId,
        scheme: type.scheme,
        provider: "mock",
        result: "ELIGIBLE",
        checkedAt: new Date(validFrom.getTime() - HOUR),
        expiresAt: new Date(validFrom.getTime() + 365 * DAY),
      });
    }
    passRows.push({
      id,
      code: codes.pass(),
      userId,
      passTypeId: type.id,
      // The purchase time copy of the type (D-036)
      pricePaise: type.pricePaise,
      durationDays: type.durationDays,
      validityMode: type.validityMode,
      eligibleServiceTypes: type.eligibleServiceTypes,
      groupSize: type.groupSize,
      status: validUntil < now ? "EXPIRED" : "ACTIVE",
      activatedAt: validFrom,
      validFrom,
      validUntil,
      eligibilityCheckId,
      paymentId,
      qrSecret: secret(),
      createdAt: new Date(validFrom.getTime() - HOUR),
    });
  };
  if (weekly) {
    for (let i = 0; i < 30; i++) addPass(weekly, payingCitizens[i]!.id, i % 7);
    for (let i = 0; i < 25; i++) addPass(weekly, payingCitizens[30 + i]!.id, 8 + (i % 7));
  }
  if (monthly) for (let i = 0; i < 20; i++) addPass(monthly, payingCitizens[60 + i]!.id, (i * 3) % 30);
  if (free) freeTravellers.forEach((u, i) => addPass(free, u.id, 20 + i));
  await prisma.eligibilityCheck.createMany({ data: eligibility });
  // Pass and payment point at each other: insert passes first, then the payments with passId
  await prisma.pass.createMany({ data: passRows.map((p) => ({ ...p, paymentId: null })) });
  await bulkInsert(prisma, "payments", passPayments, PAYMENT_TYPES, true);
  for (const p of passRows.filter((r) => r.paymentId)) {
    await prisma.pass.update({ where: { id: p.id! }, data: { paymentId: p.paymentId } });
  }

  // Weekly and monthly holders ride about once a day on an eligible service while the pass is valid
  const tripsByDate = new Map<string, HistoryTrip[]>();
  for (const t of trips) {
    if (t.status === "COMPLETED") tripsByDate.set(t.serviceDateStr, [...(tripsByDate.get(t.serviceDateStr) ?? []), t]);
  }
  const serviceTypeOf = new Map(busTypes.map((b) => [b.id, b.serviceType]));
  const passScans: Prisma.TicketScanCreateManyInput[] = [];
  for (const p of passRows) {
    const type = passTypes.find((x) => x.id === p.passTypeId)!;
    if (type.kind === "FREE_TRAVEL") continue;
    for (const [dateStr, dayTrips] of tripsByDate) {
      const dayStart = localTimeToUtc(dateStr, "00:00");
      if (dayStart < (p.validFrom as Date) || dayStart > (p.validUntil as Date) || rng() > 0.7) continue;
      const eligible = dayTrips.filter((t) => type.eligibleServiceTypes.includes(serviceTypeOf.get(t.busTypeId)!));
      if (!eligible.length) continue;
      const t = pick(rng, eligible);
      const at = new Date(t.scheduledDepartureAt.getTime() + (t.delayMinutes + int(rng, 0, 10)) * MIN);
      passScans.push({ id: newId(), passId: p.id!, tripId: t.id, conductorId: t.conductorId, result: "VALID", reason: "OK", scannedAt: at, createdAt: at });
    }
  }
  await bulkInsert(prisma, "ticket_scans", [...scans, ...passScans], { result: '"ScanResult"', reason: '"ScanReason"', scannedAt: "timestamp" }, false);
  console.log(`Passes: ${passRows.length}, ticket scans: ${scans.length}, pass scans: ${passScans.length}`);

  step("passes and scans inserted");
  // 8. 25 complaints from real trips, across categories and statuses
  const categories = ["DELAY", "CLEANLINESS", "STAFF", "TICKET", "SAFETY", "OVERCROWDING", "OTHER"] as const;
  const statuses = ["RECEIVED", "IN_REVIEW", "RESOLVED", "CLOSED"] as const;
  const usedTickets = tickets.filter((t) => t.status === "USED" && t.type === "SINGLE");
  const tripById = new Map(trips.map((t) => [t.id, t]));
  const busRegById = new Map(buses.map((b) => [b.id, b.regNo]));
  const complaints: Prisma.ComplaintCreateManyInput[] = [];
  for (let i = 0; i < 25; i++) {
    const ticket = pick(rng, usedTickets);
    const trip = tripById.get(ticket.tripId)!;
    const user = citizens.find((c) => c.id === ticket.holderUserId)!;
    const category = categories[i % categories.length]!;
    const status = statuses[i % statuses.length]!;
    const createdAt = new Date(trip.scheduledArrivalAt.getTime() + int(rng, 1, 30) * HOUR);
    const settled = status === "RESOLVED" || status === "CLOSED";
    complaints.push({
      id: newId(),
      code: codes.complaint(),
      userId: user.id,
      email: user.email!,
      category,
      message: COMPLAINT_TEXT[category]!,
      ticketCode: ticket.code,
      busRegNo: busRegById.get(trip.busId) ?? null,
      routeCode: trip.routeCode,
      travelDate: new Date(`${trip.serviceDateStr}T00:00:00.000Z`),
      status,
      depotId: trip.depotId,
      resolutionNote: settled ? pick(rng, RESOLUTION_NOTES) : null,
      resolvedAt: settled ? new Date(createdAt.getTime() + int(rng, 4, 72) * HOUR) : null,
      createdAt: createdAt > now ? new Date(now.getTime() - HOUR) : createdAt,
    });
  }
  await prisma.complaint.createMany({ data: complaints });

  // 9. 12 incidents: 11 resolved across types, plus the open breakdown
  const incidentTypes = ["DELAY", "TRAFFIC", "BUS_PROBLEM", "ROAD_BLOCK", "MEDICAL", "ACCIDENT", "OTHER"] as const;
  const driverUser = new Map(drivers.map((d) => [d.id, d.userId]));
  const completed = trips.filter((t) => t.status === "COMPLETED" && t !== breakdownTrip);
  const incidents: Prisma.IncidentCreateManyInput[] = [];
  const incidentAt = (t: HistoryTrip, minutes: number) => {
    const stops = routeById.get(t.routeId)!.routeStops;
    const stop = stops.find((s) => s.minutesFromOrigin >= minutes) ?? stops.at(-1)!;
    return { lat: stop.stop.lat, lng: stop.stop.lng };
  };
  for (let i = 0; i < 11; i++) {
    const t = completed[Math.floor(((i + 0.5) / 11) * completed.length)]!;
    const created = new Date(t.scheduledDepartureAt.getTime() + (t.delayMinutes + 20) * MIN);
    incidents.push({
      id: newId(),
      code: codes.incident(),
      type: i === 0 ? "BREAKDOWN" : incidentTypes[i % incidentTypes.length]!,
      severity: i % 4 === 0 ? "HIGH" : "MEDIUM",
      status: "RESOLVED",
      tripId: t.id,
      busId: t.busId,
      reportedById: driverUser.get(t.driverId)!,
      ...incidentAt(t, 20),
      note: "Reported by the driver from the trip screen.",
      acknowledgedAt: new Date(created.getTime() + 5 * MIN),
      acknowledgedById: manager.id,
      resolvedAt: new Date(created.getTime() + int(rng, 40, 180) * MIN),
      resolutionNote: "Crew continued after the depot cleared the issue.",
      createdAt: created,
    });
  }
  if (breakdownTrip) {
    incidents.push({
      id: newId(),
      code: codes.incident(),
      type: "BREAKDOWN",
      severity: "HIGH",
      status: "OPEN",
      tripId: breakdownTrip.id,
      busId: breakdownTrip.busId,
      reportedById: driverUser.get(breakdownTrip.driverId)!,
      ...incidentAt(breakdownTrip, 95),
      note: "Engine overheating, bus stopped on the shoulder. Passengers moved to a replacement bus.",
      createdAt: new Date(breakdownTrip.scheduledDepartureAt.getTime() + (breakdownTrip.delayMinutes + 95) * MIN),
    });
  }
  await prisma.incident.createMany({ data: incidents });

  // 10. Maintenance windows (overnight services, and the two buses in MAINTENANCE today)
  const maintenance: Prisma.MaintenanceRecordCreateManyInput[] = [];
  for (let i = 0; i < 8; i++) {
    const bus = buses[(i * 7) % buses.length]!;
    const start = localTimeToUtc(formatIstDate(new Date(now.getTime() - (2 + i) * DAY)), "22:00");
    maintenance.push({ busId: bus.id, kind: "History service", note: "Routine service", startAt: start, endAt: new Date(start.getTime() + 6 * HOUR) });
  }
  for (const bus of buses.filter((b) => b.status === "MAINTENANCE")) {
    maintenance.push({ busId: bus.id, kind: "History repair", note: "Brake overhaul", startAt: new Date(todayStart.getTime() - DAY), endAt: null });
  }
  await prisma.maintenanceRecord.createMany({ data: maintenance });

  // 11. GPS points only for the last 2 days (keeps the table small): one point per stop reached
  const gpsFrom = formatIstDate(new Date(now.getTime() - 2 * DAY));
  const gps: Prisma.GpsLocationCreateManyInput[] = [];
  for (const t of trips) {
    if (t.status !== "COMPLETED" || t.serviceDateStr < gpsFrom) continue;
    const stops = routeById.get(t.routeId)!.routeStops;
    let prev: (typeof stops)[number] | undefined;
    for (const s of stops) {
      const at = new Date(t.scheduledDepartureAt.getTime() + (t.delayMinutes + s.minutesFromOrigin) * MIN);
      const speed = prev && s.minutesFromOrigin > prev.minutesFromOrigin
        ? Math.round(((s.kmFromOrigin - prev.kmFromOrigin) / (s.minutesFromOrigin - prev.minutesFromOrigin)) * 600) / 10
        : 0;
      gps.push({ tripId: t.id, busId: t.busId, lat: s.stop.lat, lng: s.stop.lng, speedKmh: speed, accuracyM: 12, recordedAt: at, receivedAt: at });
      prev = s;
    }
  }
  await bulkInsert(prisma, "gps_locations", gps, { lat: "float8", lng: "float8", speedKmh: "float8", accuracyM: "float8", recordedAt: "timestamp", receivedAt: "timestamp" }, false);
  console.log(`Complaints: ${complaints.length}, incidents: ${incidents.length}, gps points: ${gps.length}`);

  step("complaints, incidents, maintenance, gps inserted");
  // 12. daily_stats for every history day
  const rows = await new RollupsService(prisma as unknown as PrismaService).backfill(days, now);
  console.log(`daily_stats rows: ${rows}`);
  console.log(`History done in ${((Date.now() - started) / 1000).toFixed(1)} s`);
}
