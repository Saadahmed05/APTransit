/* eslint-disable no-console */
import { formatIstDate } from "@aptransit/shared";
import type { PrismaClient } from "../src/generated/prisma/client";
import type { PrismaService } from "../src/prisma/prisma.service";
import { RollupsService } from "../src/modules/rollups/rollups.service";

/**
 * Deterministic pseudo-random number generator (Mulberry32).
 */
function createPrng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function generateHistory(
  prisma: PrismaClient,
  days = 14,
): Promise<void> {
  console.log(`Starting deterministic history generation for past ${days} days (seed: 20260923)...`);
  const prng = createPrng(20260923);

  const now = new Date();
  const startTime = Date.now();

  // 1. Fetch reference data: routes, timetables, bus types, buses, users
  const routes = await prisma.route.findMany({
    include: {
      depot: true,
      routeStops: { orderBy: { seq: "asc" } },
    },
  });
  if (routes.length === 0) {
    console.log("No routes found, cannot generate history. Run base seed first.");
    return;
  }

  const _busTypes = await prisma.busType.findMany();

  const timetables = await prisma.timetable.findMany({
    where: { isActive: true },
  });

  const buses = await prisma.bus.findMany();

  // 2. Create 200 synthetic citizens
  console.log("Creating 200 synthetic citizens...");
  const citizenUsersData = [];
  for (let i = 1; i <= 200; i++) {
    const pad = String(i).padStart(3, "0");
    citizenUsersData.push({
      email: `citizen+${pad}@aptransit.test`,
      phone: `9876543${pad}`,
      name: `Citizen ${pad}`,
      preferredLocale: i % 3 === 0 ? "te" : "en",
    });
  }
  await prisma.user.createMany({
    data: citizenUsersData,
    skipDuplicates: true,
  });

  const allCitizens = await prisma.user.findMany({
    where: { email: { startsWith: "citizen+" } },
  });
  console.log(`Available synthetic citizens: ${allCitizens.length}`);

  // 3. Generate past trips for past `days` days
  console.log(`Generating past trips for ${days} days...`);
  const pastTripData: Array<{
    code: string;
    timetableId: string;
    routeId: string;
    busTypeId: string;
    serviceDate: string;
    scheduledDepartureAt: Date;
    scheduledArrivalAt: Date;
    actualDepartureAt: Date | null;
    actualArrivalAt: Date | null;
    status: "COMPLETED" | "CANCELLED";
    delayMinutes: number;
    hasOpenIncident: boolean;
  }> = [];

  for (let d = days; d >= 1; d--) {
    const targetDate = new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
    const serviceDateStr = formatIstDate(targetDate);
    const _dayOfWeek = targetDate.getUTCDay(); // 0 is Sun

    for (const tt of timetables) {
      const route = routes.find((r) => r.id === tt.routeId);
      if (!route) continue;

      const code = `${route.code}-${serviceDateStr.replace(/-/g, "")}-${tt.departureLocal.replace(":", "")}`;

      // 97% COMPLETED, 3% CANCELLED
      const isCancelled = prng() < 0.03;
      const status = isCancelled ? "CANCELLED" : "COMPLETED";

      // Scheduled times
      const [depHour, depMin] = tt.departureLocal.split(":").map(Number);
      const scheduledDep = new Date(`${serviceDateStr}T${String(depHour).padStart(2, "0")}:${String(depMin).padStart(2, "0")}:00.000Z`);
      const durationMin = Math.round((route.distanceKm || 60) * 2);
      const scheduledArr = new Date(scheduledDep.getTime() + durationMin * 60 * 1000);

      // Delays:
      // evening (17:00 to 20:00) on KNL-VJA and VJA-GNT get 10 to 30 min delay
      let delayMinutes = 0;
      if (!isCancelled) {
        const isEveningPeak = (depHour! >= 17 && depHour! <= 20) && (route.code.includes("KNL-VJA") || route.code.includes("VJA-GNT"));
        if (isEveningPeak) {
          delayMinutes = 10 + Math.floor(prng() * 21); // 10 to 30
        } else {
          delayMinutes = Math.floor(prng() * 11); // 0 to 10
        }
      }

      const actualDep = isCancelled ? null : new Date(scheduledDep.getTime() + delayMinutes * 60 * 1000);
      const actualArr = isCancelled ? null : new Date(scheduledArr.getTime() + delayMinutes * 60 * 1000);

      pastTripData.push({
        code,
        timetableId: tt.id,
        routeId: tt.routeId,
        busTypeId: tt.busTypeId,
        serviceDate: serviceDateStr,
        scheduledDepartureAt: scheduledDep,
        scheduledArrivalAt: scheduledArr,
        actualDepartureAt: actualDep,
        actualArrivalAt: actualArr,
        status,
        delayMinutes,
        hasOpenIncident: false,
      });
    }
  }

  // Insert trips in batches
  const BATCH = 500;
  for (let i = 0; i < pastTripData.length; i += BATCH) {
    await prisma.trip.createMany({
      data: pastTripData.slice(i, i + BATCH),
      skipDuplicates: true,
    });
  }
  console.log(`Seeded ${pastTripData.length} historical trips.`);

  // 4. Fetch created trips for ticket, booking and incident generation
  const createdTrips = await prisma.trip.findMany({
    where: {
      serviceDate: {
        gte: formatIstDate(new Date(now.getTime() - days * 24 * 60 * 60 * 1000)),
        lt: formatIstDate(now),
      },
    },
    include: {
      route: {
        include: {
          routeStops: { orderBy: { seq: "asc" } },
        },
      },
      busType: true,
    },
  });

  // 5. Generate Bookings & Tickets for completed trips
  console.log("Generating realistic bookings and tickets...");
  const bookingRows: Array<{
    id: string;
    code: string;
    userId: string;
    tripId: string;
    boardingStopId: string;
    droppingStopId: string;
    totalPaise: number;
    status: "CONFIRMED";
    holdExpiresAt: Date;
    createdAt: Date;
  }> = [];

  const ticketRows: Array<{
    code: string;
    bookingId: string;
    tripId: string;
    routeId: string;
    boardingStopId: string;
    droppingStopId: string;
    farePaise: number;
    status: "USED";
    holderUserId: string;
    originalUserId: string;
    qrSecret: string;
    expiresAt: Date;
    createdAt: Date;
  }> = [];

  let ticketCounter = 100000;

  for (const trip of createdTrips) {
    if (trip.status !== "COMPLETED") continue;

    const totalSeats = trip.busType?.totalSeats || 40;
    const depHour = trip.scheduledDepartureAt.getUTCHours();
    const isPeakHour = (depHour >= 8 && depHour <= 10) || (depHour >= 17 && depHour <= 20);

    // Realistic load factor: 40% to 95%
    let loadFactor = 0.4 + prng() * 0.35; // 40% to 75%
    if (isPeakHour) loadFactor += 0.2; // up to 95%
    if (trip.route.code.includes("KNL-TPT") && (trip.scheduledDepartureAt.getUTCDay() === 0 || trip.scheduledDepartureAt.getUTCDay() === 6)) {
      loadFactor += 0.15; // weekend high
    }
    loadFactor = Math.min(0.95, loadFactor);

    const ticketsToGen = Math.floor(totalSeats * loadFactor);
    const stops = trip.route.routeStops;
    const firstStop = stops[0]?.stopId;
    const lastStop = stops[stops.length - 1]?.stopId;
    if (!firstStop || !lastStop) continue;

    for (let k = 0; k < ticketsToGen; k++) {
      ticketCounter++;
      const user = allCitizens[Math.floor(prng() * allCitizens.length)]!;
      const bookingId = `bkg_${trip.id.slice(-6)}_${k}`;
      const ticketCode = `TK${ticketCounter}`;
      const farePaise = Math.floor((trip.route.distanceKm || 50) * 150); // ~1.5 Rs per km

      bookingRows.push({
        id: bookingId,
        code: `BK${ticketCounter}`,
        userId: user.id,
        tripId: trip.id,
        boardingStopId: firstStop,
        droppingStopId: lastStop,
        totalPaise: farePaise,
        status: "CONFIRMED",
        holdExpiresAt: trip.scheduledDepartureAt,
        createdAt: trip.scheduledDepartureAt,
      });

      ticketRows.push({
        code: ticketCode,
        bookingId,
        tripId: trip.id,
        routeId: trip.routeId,
        boardingStopId: firstStop,
        droppingStopId: lastStop,
        farePaise,
        status: "USED",
        holderUserId: user.id,
        originalUserId: user.id,
        qrSecret: "history_secret_key_fixed_hash",
        expiresAt: trip.scheduledArrivalAt,
        createdAt: trip.scheduledDepartureAt,
      });
    }

    if (bookingRows.length >= 2000) {
      await prisma.booking.createMany({ data: bookingRows, skipDuplicates: true });
      await prisma.ticket.createMany({ data: ticketRows, skipDuplicates: true });
      bookingRows.length = 0;
      ticketRows.length = 0;
    }
  }

  if (bookingRows.length > 0) {
    await prisma.booking.createMany({ data: bookingRows, skipDuplicates: true });
    await prisma.ticket.createMany({ data: ticketRows, skipDuplicates: true });
  }
  console.log("Historical bookings and tickets seeded.");

  // 6. 30 weekly passes, 20 monthly passes, 60 free travel passes with scans
  console.log("Seeding passes and scans...");
  const passTypes = await prisma.passType.findMany();
  const weeklyPassType = passTypes.find((pt) => pt.kind === "WEEKLY") || passTypes[0];
  const monthlyPassType = passTypes.find((pt) => pt.kind === "MONTHLY") || passTypes[1] || passTypes[0];

  const passRows: Array<{
    code: string;
    userId: string;
    passTypeId: string;
    status: "ACTIVE";
    activatedAt: Date;
    validFrom: Date;
    validUntil: Date;
    qrSecret: string;
  }> = [];

  let passIndex = 1;
  // 30 weekly
  if (weeklyPassType) {
    for (let i = 0; i < 30; i++) {
      const user = allCitizens[i % allCitizens.length]!;
      passRows.push({
        code: `PS-WK-${String(passIndex++).padStart(4, "0")}`,
        userId: user.id,
        passTypeId: weeklyPassType.id,
        status: "ACTIVE",
        activatedAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        validFrom: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        validUntil: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        qrSecret: "pass_secret_fixed_123",
      });
    }
  }

  // 20 monthly
  if (monthlyPassType) {
    for (let i = 0; i < 20; i++) {
      const user = allCitizens[(i + 30) % allCitizens.length]!;
      passRows.push({
        code: `PS-MO-${String(passIndex++).padStart(4, "0")}`,
        userId: user.id,
        passTypeId: monthlyPassType.id,
        status: "ACTIVE",
        activatedAt: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
        validFrom: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
        validUntil: new Date(now.getTime() + 16 * 24 * 60 * 60 * 1000),
        qrSecret: "pass_secret_fixed_456",
      });
    }
  }

  if (passRows.length > 0) {
    await prisma.pass.createMany({ data: passRows, skipDuplicates: true });
  }

  // 7. Complaints (25 complaints across categories and statuses)
  console.log("Seeding 25 complaints...");
  const complaintCategories = ["DELAY", "CLEANLINESS", "STAFF", "TICKET", "SAFETY", "OVERCROWDING"] as const;
  const complaintStatuses = ["RECEIVED", "IN_REVIEW", "RESOLVED", "CLOSED"] as const;
  const complaintRows = [];
  for (let i = 1; i <= 25; i++) {
    const user = allCitizens[i % allCitizens.length]!;
    const cat = complaintCategories[i % complaintCategories.length]!;
    const st = complaintStatuses[i % complaintStatuses.length]!;
    complaintRows.push({
      code: `CMP-2026-${String(i).padStart(4, "0")}`,
      userId: user.id,
      email: user.email!,
      category: cat,
      message: `Historical feedback regarding transit service (${cat.toLowerCase()}) on route.`,
      status: st,
      resolutionNote: st === "RESOLVED" || st === "CLOSED" ? "Matter reviewed with depot manager and resolved." : null,
      resolvedAt: st === "RESOLVED" || st === "CLOSED" ? now : null,
      createdAt: new Date(now.getTime() - (i % 14) * 24 * 60 * 60 * 1000),
    });
  }
  await prisma.complaint.createMany({ data: complaintRows, skipDuplicates: true });

  // 8. Incidents (12 incidents across types, resolved except one open breakdown)
  console.log("Seeding 12 incidents...");
  const incidentTypes = ["BREAKDOWN", "DELAY", "ACCIDENT", "TRAFFIC", "BUS_PROBLEM"] as const;
  const incidentRows = [];
  for (let i = 1; i <= 12; i++) {
    const trip = createdTrips[i * 10 % createdTrips.length]!;
    const bus = buses[i % buses.length]!;
    const isBreakdownToday = i === 1; // The one open breakdown
    const type = isBreakdownToday ? "BREAKDOWN" : incidentTypes[i % incidentTypes.length]!;
    incidentRows.push({
      code: `INC-2026-${String(i).padStart(4, "0")}`,
      tripId: trip.id,
      busId: bus.id,
      reportedById: allCitizens[0]!.id,
      lat: 15.8281 + (i * 0.01),
      lng: 78.0373 + (i * 0.01),
      type,
      severity: isBreakdownToday ? ("CRITICAL" as const) : ("MEDIUM" as const),
      status: isBreakdownToday ? ("OPEN" as const) : ("RESOLVED" as const),
      note: isBreakdownToday ? "Engine breakdown near Kurnool bypass road." : "Resolved on-site by depot technician.",
      createdAt: isBreakdownToday ? now : new Date(now.getTime() - (i % 14) * 24 * 60 * 60 * 1000),
      resolvedAt: isBreakdownToday ? null : now,
    });
  }
  await prisma.incident.createMany({ data: incidentRows, skipDuplicates: true });

  // 9. GPS locations only for the last 2 days (keep table small)
  console.log("Seeding gps_locations for the last 2 days...");
  const recentTrips = createdTrips.filter((t) => {
    const diffDays = (now.getTime() - t.scheduledDepartureAt.getTime()) / (24 * 60 * 60 * 1000);
    return diffDays <= 2;
  }).slice(0, 30); // sample of trips

  const gpsRows = [];
  for (const t of recentTrips) {
    const stops = t.route.routeStops;
    for (let s = 0; s < Math.min(5, stops.length); s++) {
      const _stop = stops[s]!;
      gpsRows.push({
        tripId: t.id,
        busId: buses[0]?.id || "bus_sample",
        lat: 15.8281 + s * 0.05,
        lng: 78.0373 + s * 0.05,
        speedKmh: 45.5,
        headingDeg: 90,
        recordedAt: new Date(t.scheduledDepartureAt.getTime() + s * 15 * 60 * 1000),
      });
    }
  }
  if (gpsRows.length > 0) {
    await prisma.gpsLocation.createMany({ data: gpsRows, skipDuplicates: true });
  }

  // 10. Compute daily_stats for all 14 days
  console.log("Computing daily_stats rollups for all 14 days...");
  const rollupsService = new RollupsService(prisma as unknown as PrismaService);
  await rollupsService.backfill(days);

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`History generation complete in ${durationSec}s!`);
}
