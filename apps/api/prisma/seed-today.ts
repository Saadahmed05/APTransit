/* eslint-disable no-console */
import { randomBytes } from "node:crypto";
import {
  calculateFare,
  formatIstDate,
  generateBookingCode,
  generateComplaintCode,
  generateIncidentCode,
  generateTicketCode,
  localTimeToUtc,
  utcToIstParts,
} from "@aptransit/shared";
import { sealSecret } from "../src/common/crypto/secret-box";
import type { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { START_WINDOW_MINUTES } from "../src/modules/driver/driver.service";
import { activationClosesAt } from "../src/modules/tickets/ticket-rules";
import {
  bulkInsert,
  COMPLAINT_TEXT,
  createPrng,
  delayFor,
  FIRST_NAMES,
  int,
  loadFactor,
  PAYMENT_TYPES,
  pick,
  type Rng,
} from "./seed-history";

// Sample data for today, so every portal opens on a day in progress (`pnpm db:seed --today`):
// trips that already arrived today are completed with passengers, the demo crew's next trips have
// passengers waiting, and there are open incidents, new complaints and recent audit events.
// Live bus positions are not faked: run `pnpm simulate` for the live maps.
// Every row written here has an id that starts with PREFIX, so a rerun replaces it.

const PREFIX = "todayseed";
const SEED = 20261017;
const MIN = 60_000;
const HOUR = 60 * MIN;
const mine = { id: { startsWith: PREFIX } };

function idMaker(rng: Rng) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  return () => {
    let out = PREFIX;
    for (let i = 0; i < 15; i++) out += alphabet[Math.floor(rng() * alphabet.length)];
    return out;
  };
}

/** Short codes (BKG has 6 characters) collide at this volume: unique within the run and not already in the table. */
async function freeCodes(prisma: PrismaClient, table: string, rows: { code: string }[], make: () => string): Promise<void> {
  const seen = new Set<string>();
  for (const row of rows) {
    while (seen.has(row.code)) row.code = make();
    seen.add(row.code);
  }
  for (;;) {
    const taken = new Set(
      (await prisma.$queryRawUnsafe<{ code: string }[]>(`SELECT code FROM "${table}" WHERE code = ANY($1::text[])`, rows.map((r) => r.code))).map((r) => r.code),
    );
    if (!taken.size) return;
    for (const row of rows) {
      if (!taken.has(row.code)) continue;
      do row.code = make();
      while (seen.has(row.code));
      seen.add(row.code);
    }
  }
}

export async function generateToday(prisma: PrismaClient, now = new Date()): Promise<void> {
  const started = Date.now();
  const rng = createPrng(SEED);
  const newId = idMaker(rng);
  const qrKey = process.env.QR_SECRET_KEY;
  if (!qrKey) throw new Error("QR_SECRET_KEY is required to seal ticket secrets");
  const secret = () => sealSecret(randomBytes(32), qrKey);
  const todayStr = formatIstDate(now);
  const serviceDate = new Date(`${todayStr}T00:00:00.000Z`);
  const dayStart = localTimeToUtc(todayStr, "00:00");
  console.log(`Today: sample data for ${todayStr}`);

  // 1. Remove an earlier run: its rows, and the trips it completed today put back to scheduled
  const touched = (
    await prisma.trip.findMany({
      where: {
        serviceDate: { gte: serviceDate },
        status: "COMPLETED",
        OR: [{ assignments: { some: mine } }, { tickets: { some: mine } }],
      },
      select: { id: true },
    })
  ).map((t) => t.id);
  const flagged = (await prisma.incident.findMany({ where: mine, select: { tripId: true } })).map((i) => i.tripId);
  const ofMyTickets = { ticketId: { startsWith: PREFIX } };
  await prisma.ticketScan.deleteMany({ where: { OR: [mine, ofMyTickets] } });
  await prisma.refund.deleteMany({ where: { OR: [ofMyTickets, { paymentId: { startsWith: PREFIX } }] } });
  await prisma.ticketTransfer.deleteMany({ where: ofMyTickets });
  await prisma.ticket.deleteMany({ where: mine });
  await prisma.payment.deleteMany({ where: mine });
  await prisma.booking.deleteMany({ where: mine });
  await prisma.incident.deleteMany({ where: mine });
  await prisma.complaint.deleteMany({ where: mine });
  await prisma.auditLog.deleteMany({ where: mine });
  await prisma.tripAssignment.deleteMany({ where: mine });
  if (touched.length) {
    await prisma.trip.updateMany({
      where: { id: { in: touched } },
      data: { status: "SCHEDULED", actualDepartureAt: null, actualArrivalAt: null, delayMinutes: 0, lastStopSeq: null },
    });
    await prisma.tripAssignment.updateMany({ where: { tripId: { in: touched } }, data: { endedAt: null } });
  }
  if (flagged.length) {
    await prisma.trip.updateMany({
      where: { id: { in: flagged }, incidents: { none: { status: { not: "RESOLVED" } } } },
      data: { hasOpenIncident: false },
    });
  }

  // 2. Reference data from the base seed
  const [routes, busTypes, buses, drivers, conductors, staff, closesSetting] = await Promise.all([
    prisma.route.findMany({
      include: {
        depot: { select: { code: true } },
        routeStops: { orderBy: { seq: "asc" }, include: { stop: { select: { lat: true, lng: true } } } },
      },
    }),
    prisma.busType.findMany({ include: { fareRules: { orderBy: { validFrom: "desc" } } } }),
    prisma.bus.findMany({ where: { status: { notIn: ["BREAKDOWN", "MAINTENANCE"] } }, orderBy: { regNo: "asc" } }),
    prisma.driver.findMany({ orderBy: { employeeCode: "asc" } }),
    prisma.conductor.findMany({ orderBy: { employeeCode: "asc" } }),
    prisma.user.findMany({
      where: {
        email: {
          in: [
            "manager.knl@aptransit.test",
            "transport@aptransit.test",
            "admin@aptransit.test",
            "citizen@aptransit.test",
            "citizen2@aptransit.test",
            "driver2.knl@aptransit.test",
          ],
        },
      },
      select: { id: true, email: true, name: true },
    }),
    prisma.setting.findUnique({ where: { key: "activation.closesMinutesAfter" } }),
  ]);
  const user = (email: string) => staff.find((u) => u.email === email);
  const manager = user("manager.knl@aptransit.test");
  const demoConductor = conductors.find((c) => c.employeeCode === "EMP-CON-001");
  if (!routes.length || !drivers.length || !conductors.length || !manager || !demoConductor) {
    console.log("Base data missing (routes, crew or the Kurnool manager). Run pnpm db:seed first.");
    return;
  }
  const closesMinutes = typeof closesSetting?.value === "number" ? closesSetting.value : 30;
  const routeById = new Map(routes.map((r) => [r.id, r]));
  const busTypeById = new Map(busTypes.map((b) => [b.id, b]));
  const driverUser = new Map(drivers.map((d) => [d.id, d.userId]));

  // 3. Forty riders (kept apart from the history citizens, which a history run replaces)
  await prisma.user.createMany({
    data: Array.from({ length: 40 }, (_, i) => {
      const n = String(i + 1).padStart(2, "0");
      return { email: `rider.${n}@aptransit.test`, name: `${FIRST_NAMES[i % FIRST_NAMES.length]} R${n}`, preferredLocale: i % 3 === 0 ? "te" : "en" };
    }),
    skipDuplicates: true,
  });
  const riders = await prisma.user.findMany({
    where: { email: { startsWith: "rider." } },
    orderBy: { email: "asc" },
    select: { id: true, email: true, name: true },
  });

  // 4. Today's trips
  const trips = await prisma.trip.findMany({
    where: { serviceDate },
    select: {
      id: true,
      code: true,
      routeId: true,
      busTypeId: true,
      status: true,
      scheduledDepartureAt: true,
      scheduledArrivalAt: true,
      assignments: { where: { endedAt: null }, select: { busId: true, driverId: true, conductorId: true } },
    },
    orderBy: { scheduledDepartureAt: "asc" },
  });
  const depotBuses = new Map<string, typeof buses>();
  for (const b of buses) depotBuses.set(b.depotId, [...(depotBuses.get(b.depotId) ?? []), b]);
  const turn = new Map<string, number>();
  const next = <T>(key: string, list: readonly T[]): T => {
    const n = turn.get(key) ?? 0;
    turn.set(key, n + 1);
    return list[n % list.length]!;
  };
  const pickBus = (depotId: string, busTypeId: string) => {
    const pool = depotBuses.get(depotId) ?? buses;
    const same = pool.filter((b) => b.busTypeId === busTypeId);
    return next(`b${depotId}${same.length ? busTypeId : ""}`, same.length ? same : pool);
  };
  // The demo pair keeps its own line (trips.autoAssign); the other crew share the rest
  const crewOf = <T extends { depotId: string; employeeCode: string }>(list: readonly T[], depotId: string) => {
    const depot = list.filter((x) => x.depotId === depotId);
    const own = depot.filter((x) => !x.employeeCode.endsWith("-001"));
    return own.length ? own : depot.length ? depot : list;
  };

  const bookings: Prisma.BookingCreateManyInput[] = [];
  const passengers: Prisma.BookingPassengerCreateManyInput[] = [];
  const payments: Prisma.PaymentCreateManyInput[] = [];
  const tickets: Prisma.TicketCreateManyInput[] = [];
  const scans: Prisma.TicketScanCreateManyInput[] = [];
  const assignments: Prisma.TripAssignmentCreateManyInput[] = [];
  let paymentNo = 0;

  const book = (
    trip: (typeof trips)[number],
    rider: { id: string; name: string | null },
    seatNo: string,
    board: number,
    drop: number,
    ride: { departed: Date; busId: string; conductorId: string | null } | null,
  ) => {
    const route = routeById.get(trip.routeId)!;
    const busType = busTypeById.get(trip.busTypeId)!;
    const rule = busType.fareRules.find((r) => r.validFrom <= trip.scheduledDepartureAt) ?? busType.fareRules.at(-1);
    if (!rule) return null;
    const from = route.routeStops[board]!;
    const to = route.routeStops[drop]!;
    const fare = calculateFare({ distanceKm: to.kmFromOrigin - from.kmFromOrigin, rule, isFreeTravel: false }).totalPaise;
    const bookedAt = new Date(Math.min(now.getTime() - 5 * MIN, trip.scheduledDepartureAt.getTime() - int(rng, 20, 600) * MIN));
    const bookingId = newId();
    const passengerId = newId();
    const ticketId = newId();
    paymentNo++;
    bookings.push({
      id: bookingId,
      code: generateBookingCode(),
      userId: rider.id,
      tripId: trip.id,
      boardingStopId: from.stopId,
      droppingStopId: to.stopId,
      status: "CONFIRMED",
      totalPaise: fare,
      holdExpiresAt: new Date(bookedAt.getTime() + 10 * MIN),
      createdAt: bookedAt,
    });
    passengers.push({ id: passengerId, bookingId, name: rider.name ?? "Passenger", category: "ADULT", seatNo, createdAt: bookedAt });
    payments.push({
      id: newId(),
      bookingId,
      providerOrderId: `order_today_${String(paymentNo).padStart(7, "0")}`,
      providerPaymentId: `pay_today_${String(paymentNo).padStart(7, "0")}`,
      amountPaise: fare,
      status: "CAPTURED",
      capturedAt: new Date(bookedAt.getTime() + 2 * MIN),
      createdAt: bookedAt,
    });
    const boardingAt = new Date(trip.scheduledDepartureAt.getTime() + from.minutesFromOrigin * MIN);
    const scannedAt = ride ? new Date(ride.departed.getTime() + (from.minutesFromOrigin + int(rng, 0, 4)) * MIN) : null;
    tickets.push({
      id: ticketId,
      code: generateTicketCode(),
      bookingId,
      passengerId,
      type: "SINGLE",
      status: ride ? "USED" : "BOOKED",
      holderUserId: rider.id,
      originalUserId: rider.id,
      tripId: trip.id,
      routeId: trip.routeId,
      boardingStopId: from.stopId,
      droppingStopId: to.stopId,
      seatNo,
      farePaise: fare,
      activatedAt: scannedAt ? new Date(scannedAt.getTime() - int(rng, 5, 20) * MIN) : null,
      validUntil: scannedAt ? new Date(trip.scheduledArrivalAt.getTime() + 2 * HOUR) : null,
      scannedAt,
      usedAt: ride ? new Date(ride.departed.getTime() + to.minutesFromOrigin * MIN) : null,
      expiresAt: activationClosesAt({ boardingDepartureAt: boardingAt, delayMinutes: 0 }, closesMinutes),
      qrSecret: secret(),
      giftable: true,
      createdAt: bookedAt,
    });
    if (ride && scannedAt) {
      scans.push({
        id: newId(),
        ticketId,
        tripId: trip.id,
        conductorId: ride.conductorId,
        busId: ride.busId,
        stopId: from.stopId,
        result: "VALID",
        reason: "OK",
        scannedAt,
        createdAt: scannedAt,
      });
    }
    return ticketId;
  };

  const routeCodeOf = (t: (typeof trips)[number]) => routeById.get(t.routeId)!.code;
  const knlDepotId = routes.find((r) => r.depot.code === "D-KNL")?.depotId;

  // 5. Trips that already arrived today: completed, with crew, passengers and scans
  const done = trips.filter((t) => t.status === "SCHEDULED" && t.scheduledArrivalAt <= now);
  const completed: { id: string; delay: number; seq: number }[] = [];
  const completedTrip = new Map<string, { busId: string; driverId: string; delay: number }>();
  for (const t of done) {
    const route = routeById.get(t.routeId)!;
    const busType = busTypeById.get(t.busTypeId)!;
    const ist = utcToIstParts(t.scheduledDepartureAt);
    const lateBy = Math.floor((now.getTime() - t.scheduledArrivalAt.getTime()) / MIN);
    const delay = Math.min(delayFor(rng, route.code, ist.hours), lateBy);
    let crew = t.assignments[0];
    if (!crew) {
      crew = {
        busId: pickBus(route.depotId, t.busTypeId).id,
        driverId: next(`d${route.depotId}`, crewOf(drivers, route.depotId)).id,
        conductorId: next(`c${route.depotId}`, crewOf(conductors, route.depotId)).id,
      };
      const start = new Date(t.scheduledDepartureAt.getTime() + delay * MIN);
      assignments.push({
        id: newId(),
        tripId: t.id,
        ...crew,
        reason: "INITIAL",
        assignedById: manager.id,
        startedAt: start,
        endedAt: new Date(t.scheduledArrivalAt.getTime() + delay * MIN),
        createdAt: new Date(dayStart.getTime() - 2 * HOUR),
      });
    }
    completed.push({ id: t.id, delay, seq: route.routeStops.at(-1)?.seq ?? 0 });
    completedTrip.set(t.id, { busId: crew.busId, driverId: crew.driverId, delay });

    const stops = route.routeStops;
    if (stops.length < 2) continue;
    const departed = new Date(t.scheduledDepartureAt.getTime() + delay * MIN);
    const travellers = Math.round(busType.totalSeats * loadFactor(rng, route.code, ist.hours, now.getUTCDay()));
    for (let seat = 1; seat <= travellers; seat++) {
      const fullRoute = rng() < 0.55 || stops.length < 3;
      const board = fullRoute ? 0 : int(rng, 0, stops.length - 2);
      const drop = fullRoute ? stops.length - 1 : int(rng, board + 1, stops.length - 1);
      book(t, pick(rng, riders), String(seat), board, drop, { departed, busId: crew.busId, conductorId: crew.conductorId });
    }
  }

  // 6. The demo crew's next trips (the conductor home and manifest): passengers waiting to board
  const upcoming = (
    await prisma.tripAssignment.findMany({
      where: { endedAt: null, conductorId: demoConductor.id, trip: { serviceDate, status: { in: ["SCHEDULED", "RUNNING"] } } },
      select: { tripId: true },
      orderBy: { trip: { scheduledDepartureAt: "asc" } },
    })
  )
    .map((a) => trips.find((t) => t.id === a.tripId))
    .filter((t): t is (typeof trips)[number] => !!t && t.scheduledDepartureAt.getTime() + START_WINDOW_MINUTES * MIN >= now.getTime())
    .slice(0, 3);
  const citizens = [user("citizen@aptransit.test"), user("citizen2@aptransit.test")];
  let waiting = 0;
  for (const [index, t] of upcoming.entries()) {
    const stops = routeById.get(t.routeId)!.routeStops;
    const taken = new Set(
      (await prisma.ticket.findMany({ where: { tripId: t.id }, select: { seatNo: true } })).map((x) => x.seatNo),
    );
    const free = Array.from({ length: busTypeById.get(t.busTypeId)!.totalSeats }, (_, i) => String(i + 1)).filter((s) => !taken.has(s));
    const people = [...(citizens[index] ? [citizens[index]] : []), ...Array.from({ length: int(rng, 10, 18) }, () => pick(rng, riders))];
    for (const person of people.slice(0, free.length)) {
      const board = int(rng, 0, Math.max(0, stops.length - 3));
      if (book(t, person, free.shift()!, board, int(rng, board + 1, stops.length - 1), null)) waiting++;
    }
  }
  console.log(`Demo crew: ${upcoming.length} next trips, ${waiting} passengers waiting`);

  // 7. Five more Kurnool crews run city lines for the rest of today, so `pnpm simulate --fleet`
  // fills the live maps. Each crew rotates over three buses the demo crew does not use.
  const FLEET: [string, string, string[]][] = [
    ["EMP-DRV-003", "EMP-CON-003", ["KSJ-01", "JSK-02"]],
    ["EMP-DRV-004", "EMP-CON-004", ["KSL-01", "LSK-02"]],
    ["EMP-DRV-005", "EMP-CON-005", ["KCC-01", "CCK-02"]],
    ["EMP-DRV-006", "EMP-CON-006", ["KSE-01", "ESK-02"]],
    ["EMP-DRV-007", "EMP-CON-007", ["KSF-01", "FSK-02"]],
  ];
  const autoAssign = await prisma.setting.findUnique({ where: { key: "trips.autoAssign" } });
  const demoBuses = new Set(((autoAssign?.value as { busRegNos?: string[] } | null)?.busRegNos ?? []));
  const fleetPool = buses.filter((b) => b.depotId === knlDepotId && !demoBuses.has(b.regNo));
  let fleetTrips = 0;
  for (const [index, [driverCode, conductorCode, codes]] of FLEET.entries()) {
    const driver = drivers.find((d) => d.employeeCode === driverCode);
    const conductor = conductors.find((c) => c.employeeCode === conductorCode);
    const own = fleetPool.slice(index * 3, index * 3 + 3);
    if (!driver || !conductor || !own.length) continue;
    const lineTrips = trips.filter(
      (t) =>
        codes.includes(routeCodeOf(t)) &&
        t.status === "SCHEDULED" &&
        !t.assignments.length &&
        !completedTrip.has(t.id) &&
        t.scheduledDepartureAt.getTime() + START_WINDOW_MINUTES * MIN >= now.getTime(),
    );
    for (const [i, t] of lineTrips.entries()) {
      assignments.push({ id: newId(), tripId: t.id, busId: own[i % own.length]!.id, driverId: driver.id, conductorId: conductor.id, reason: "INITIAL", assignedById: manager.id, startedAt: t.scheduledDepartureAt, createdAt: new Date(dayStart.getTime() - 2 * HOUR) });
      fleetTrips++;
      // A few passengers on the trips of the next two hours
      if (t.scheduledDepartureAt.getTime() > now.getTime() + 2 * HOUR) continue;
      const stops = routeById.get(t.routeId)!.routeStops;
      for (let seat = 1; seat <= int(rng, 4, 9); seat++) {
        const board = int(rng, 0, stops.length - 2);
        book(t, pick(rng, riders), String(seat), board, int(rng, board + 1, stops.length - 1), null);
      }
    }
  }
  console.log(`Fleet: ${fleetTrips} trips on Kurnool Local O, P, B, J and K for five more crews`);

  // 7. Write the passengers, then the incidents, complaints and audit events
  await freeCodes(prisma, "bookings", bookings, generateBookingCode);
  await freeCodes(prisma, "tickets", tickets, generateTicketCode);
  await bulkInsert(prisma, "trip_assignments", assignments, { reason: '"AssignmentReason"', startedAt: "timestamp", endedAt: "timestamp" }, false);
  await bulkInsert(prisma, "bookings", bookings, { status: '"BookingStatus"', totalPaise: "int4", holdExpiresAt: "timestamp" }, true);
  await bulkInsert(prisma, "booking_passengers", passengers, { category: '"PassengerCategory"' }, false);
  await bulkInsert(prisma, "payments", payments, PAYMENT_TYPES, true);
  await bulkInsert(
    prisma,
    "tickets",
    tickets,
    { type: '"TicketType"', status: '"TicketStatus"', farePaise: "int4", activatedAt: "timestamp", validUntil: "timestamp", scannedAt: "timestamp", usedAt: "timestamp", expiresAt: "timestamp", giftable: "bool" },
    true,
  );
  await bulkInsert(prisma, "ticket_scans", scans, { result: '"ScanResult"', reason: '"ScanReason"', scannedAt: "timestamp" }, false);
  console.log(`Bookings: ${bookings.length}, tickets: ${tickets.length}, scans: ${scans.length}`);
  // Trips change state last, so a run that fails earlier leaves them as they were
  if (completed.length) {
    await prisma.$executeRawUnsafe(
      `UPDATE "trips" AS t SET "status" = 'COMPLETED', "delayMinutes" = u.delay,
         "actualDepartureAt" = t."scheduledDepartureAt" + make_interval(mins => u.delay),
         "actualArrivalAt" = t."scheduledArrivalAt" + make_interval(mins => u.delay),
         "lastStopSeq" = u.seq, "updatedAt" = now()
       FROM unnest($1::text[], $2::int4[], $3::int4[]) AS u(id, delay, seq) WHERE t.id = u.id`,
      completed.map((c) => c.id),
      completed.map((c) => c.delay),
      completed.map((c) => c.seq),
    );
    // The demo crew's assignments on those trips end when the trip arrived
    await prisma.$executeRawUnsafe(
      `UPDATE "trip_assignments" AS a SET "endedAt" = t."actualArrivalAt"
       FROM "trips" AS t WHERE a."tripId" = t.id AND a."endedAt" IS NULL AND t.id = ANY($1::text[])`,
      completed.map((c) => c.id),
    );
  }
  console.log(`Completed today so far: ${completed.length} trips`);

  const lastDone = (code: string) => done.filter((t) => routeCodeOf(t) === code).at(-1);
  const stopAt = (t: (typeof trips)[number], minutes: number) => {
    const stops = routeById.get(t.routeId)!.routeStops;
    const s = stops.find((x) => x.minutesFromOrigin >= minutes) ?? stops.at(-1)!;
    return { lat: s.stop.lat, lng: s.stop.lng };
  };

  // A bus problem reported on the next Kurnool to Vijayawada trip, assigned to a second crew
  const incidents: Prisma.IncidentCreateManyInput[] = [];
  const knlDepot = routes.find((r) => r.code === "KNL-VJA-01")?.depotId;
  const vja = trips.find((t) => routeCodeOf(t) === "KNL-VJA-01" && t.status === "SCHEDULED" && t.scheduledDepartureAt > now && !t.assignments.length);
  const driver2 = drivers.find((d) => d.employeeCode === "EMP-DRV-002");
  const conductor2 = conductors.find((c) => c.employeeCode === "EMP-CON-002");
  let vjaAssignment: { busId: string } | null = null;
  if (vja && knlDepot && driver2 && conductor2) {
    vjaAssignment = { busId: pickBus(knlDepot, vja.busTypeId).id };
    await prisma.tripAssignment.create({
      data: { id: newId(), tripId: vja.id, busId: vjaAssignment.busId, driverId: driver2.id, conductorId: conductor2.id, reason: "INITIAL", assignedById: manager.id, startedAt: vja.scheduledDepartureAt, createdAt: new Date(now.getTime() - 3 * HOUR) },
    });
    incidents.push({
      id: newId(),
      code: generateIncidentCode(),
      type: "BUS_PROBLEM",
      severity: "HIGH",
      status: "OPEN",
      tripId: vja.id,
      busId: vjaAssignment.busId,
      reportedById: driver2.userId,
      ...stopAt(vja, 0),
      note: "AC not cooling and a warning light on the dashboard. Asked the depot to check before departure.",
      createdAt: new Date(now.getTime() - 25 * MIN),
    });
  }
  const incidentOn = (
    t: (typeof trips)[number] | undefined,
    data: Pick<Prisma.IncidentCreateManyInput, "type" | "severity" | "status" | "note"> & { minutes: number; ack?: boolean; resolved?: string },
  ) => {
    const ran = t && completedTrip.get(t.id);
    if (!t || !ran) return;
    const createdAt = new Date(t.scheduledDepartureAt.getTime() + (ran.delay + data.minutes) * MIN);
    incidents.push({
      id: newId(),
      code: generateIncidentCode(),
      type: data.type,
      severity: data.severity,
      status: data.status,
      tripId: t.id,
      busId: ran.busId,
      reportedById: driverUser.get(ran.driverId)!,
      ...stopAt(t, data.minutes),
      note: data.note,
      acknowledgedAt: data.ack || data.resolved ? new Date(createdAt.getTime() + 6 * MIN) : null,
      acknowledgedById: data.ack || data.resolved ? manager.id : null,
      resolvedAt: data.resolved ? new Date(createdAt.getTime() + 50 * MIN) : null,
      resolutionNote: data.resolved ?? null,
      createdAt,
    });
  };
  incidentOn(lastDone("KCC-01"), { type: "TRAFFIC", severity: "MEDIUM", status: "ACKNOWLEDGED", minutes: 6, ack: true, note: "Traffic jam at Kotla Circle, the bus is about 12 minutes late." });
  incidentOn(lastDone("VJA-GNT-01"), { type: "DELAY", severity: "MEDIUM", status: "OPEN", minutes: 20, note: "Long queue at the Mangalagiri signal." });
  incidentOn(done.filter((t) => routeCodeOf(t) === "KHL-01").at(-4), { type: "ROAD_BLOCK", severity: "LOW", status: "RESOLVED", minutes: 8, resolved: "Police cleared the road, the bus took the next street." });
  incidentOn(done.filter((t) => routeCodeOf(t) === "KNL-NDL-01").at(-3), { type: "MEDICAL", severity: "HIGH", status: "RESOLVED", minutes: 40, resolved: "A passenger felt dizzy; the crew stopped at the Panyam clinic and the passenger went home safely." });
  await freeCodes(prisma, "incidents", incidents, generateIncidentCode);
  await prisma.incident.createMany({ data: incidents });
  const open = incidents.filter((i) => i.status !== "RESOLVED").map((i) => i.tripId);
  if (open.length) await prisma.trip.updateMany({ where: { id: { in: open } }, data: { hasOpenIncident: true } });

  // New complaints today, most still waiting for the depot
  const used = tickets.filter((t) => t.status === "USED");
  const statuses = ["RECEIVED", "RECEIVED", "IN_REVIEW", "RECEIVED", "RESOLVED"] as const;
  const categories = ["DELAY", "CLEANLINESS", "STAFF", "OVERCROWDING", "TICKET"] as const;
  const complaints: Prisma.ComplaintCreateManyInput[] = [];
  for (const [i, category] of categories.entries()) {
    const ticket = used.length ? used[Math.floor(((i + 0.5) / categories.length) * used.length)] : undefined;
    const trip = ticket ? trips.find((t) => t.id === ticket.tripId) : undefined;
    const rider = riders.find((r) => r.id === ticket?.holderUserId) ?? riders[i]!;
    const createdAt = new Date(Math.max(dayStart.getTime() + 30 * MIN, now.getTime() - (i + 1) * 47 * MIN));
    const status = statuses[i]!;
    complaints.push({
      id: newId(),
      code: generateComplaintCode(),
      userId: rider.id,
      email: rider.email!,
      category,
      message: COMPLAINT_TEXT[category]!,
      ticketCode: ticket?.code ?? null,
      busRegNo: trip ? (buses.find((b) => b.id === completedTrip.get(trip.id)?.busId)?.regNo ?? null) : null,
      routeCode: trip ? routeCodeOf(trip) : null,
      travelDate: serviceDate,
      status,
      depotId: trip ? routeById.get(trip.routeId)!.depotId : knlDepot,
      resolutionNote: status === "RESOLVED" ? "Checked the scan log; the ticket was valid. Sorry for the trouble." : null,
      resolvedAt: status === "RESOLVED" ? new Date(Math.min(now.getTime(), createdAt.getTime() + 40 * MIN)) : null,
      createdAt,
    });
  }
  await freeCodes(prisma, "complaints", complaints, generateComplaintCode);
  await prisma.complaint.createMany({ data: complaints });

  // Recent audit events for the admin overview
  const at = (minutesAgo: number) => new Date(Math.max(dayStart.getTime(), now.getTime() - minutesAgo * MIN));
  const pendingDevice = user("driver2.knl@aptransit.test")
    ? await prisma.device.findFirst({ where: { userId: user("driver2.knl@aptransit.test")!.id, approvedAt: null }, select: { id: true, label: true } })
    : null;
  const firstDemoTrip = done.find((t) => t.assignments.length);
  const events: Omit<Prisma.AuditLogCreateManyInput, "id" | "ip" | "userAgent">[] = [
    { actorUserId: manager.id, actorRole: "DEPOT_MANAGER" as const, action: "auth.login", entityType: "user", entityId: manager.id, createdAt: at(240) },
    ...(firstDemoTrip
      ? [
          { actorUserId: driverUser.get(firstDemoTrip.assignments[0]!.driverId)!, actorRole: "DRIVER" as const, action: "trip.start", entityType: "trip", entityId: firstDemoTrip.id, before: { status: "SCHEDULED" }, after: { status: "RUNNING" }, createdAt: at(230) },
          { actorUserId: driverUser.get(firstDemoTrip.assignments[0]!.driverId)!, actorRole: "DRIVER" as const, action: "trip.end", entityType: "trip", entityId: firstDemoTrip.id, before: { status: "RUNNING" }, after: { status: "COMPLETED" }, createdAt: at(215) },
        ]
      : []),
    ...(vja ? [{ actorUserId: manager.id, actorRole: "DEPOT_MANAGER" as const, action: "trip.assign", entityType: "trip", entityId: vja.id, after: { driver: "EMP-DRV-002", conductor: "EMP-CON-002" }, createdAt: at(180) }] : []),
    ...(pendingDevice ? [{ actorUserId: user("driver2.knl@aptransit.test")!.id, actorRole: "DRIVER" as const, action: "device.register", entityType: "device", entityId: pendingDevice.id, after: { label: pendingDevice.label }, createdAt: at(150) }] : []),
    ...incidents.map((i) => ({ actorUserId: i.reportedById, actorRole: "DRIVER" as const, action: "incident.create", entityType: "incident", entityId: i.id!, after: { type: i.type, severity: i.severity ?? "MEDIUM" }, createdAt: at(Math.max(1, (now.getTime() - (i.createdAt as Date).getTime()) / MIN)) })),
    ...incidents.filter((i) => i.acknowledgedAt).map((i) => ({ actorUserId: manager.id, actorRole: "DEPOT_MANAGER" as const, action: "incident.acknowledge", entityType: "incident", entityId: i.id!, createdAt: i.acknowledgedAt as Date })),
    ...complaints.filter((c) => c.status !== "RECEIVED").map((c) => ({ actorUserId: manager.id, actorRole: "DEPOT_MANAGER" as const, action: "complaint.update", entityType: "complaint", entityId: c.id!, before: { status: "RECEIVED" }, after: { status: c.status }, createdAt: at(20) })),
    ...(user("transport@aptransit.test") ? [{ actorUserId: user("transport@aptransit.test")!.id, actorRole: "TRANSPORT_OFFICER" as const, action: "report.export", entityType: "report", entityId: "daily-operations", after: { format: "csv", date: todayStr }, createdAt: at(60) }] : []),
    ...(user("admin@aptransit.test") && driver2 ? [{ actorUserId: user("admin@aptransit.test")!.id, actorRole: "STATE_ADMIN" as const, action: "role.grant", entityType: "user", entityId: driver2.userId, after: { role: "DRIVER", depot: "D-KNL" }, createdAt: at(300) }] : []),
  ];
  const audit = events.map((a) => ({ ...a, id: newId(), ip: "10.0.0.12", userAgent: "AP TransitOS demo seed" }));
  await prisma.auditLog.createMany({ data: audit });

  console.log(`Incidents: ${incidents.length}, complaints: ${complaints.length}, audit events: ${audit.length}`);
  console.log(`Today done in ${((Date.now() - started) / 1000).toFixed(1)} s`);
}
