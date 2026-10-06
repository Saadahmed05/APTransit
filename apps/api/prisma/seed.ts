/* eslint-disable no-console */
import { createHash } from "crypto";
import { encodePolyline, formatIstDate } from "@aptransit/shared";
import { PrismaPg } from "@prisma/adapter-pg";
import type { Prisma } from "../src/generated/prisma/client";
import { PrismaClient } from "../src/generated/prisma/client";
import type { TimetableInput } from "../src/modules/trips/trip-generator";
import { generateTripsForTimetables } from "../src/modules/trips/trip-generator";
import {
  BUS_TYPES,
  DEPOTS,
  DISTRICTS,
  ROUTE_DEFS,
  TIMETABLE_DEFS,
  STOPS,
} from "./seed-data";

try {
  process.loadEnvFile(".env");
} catch {
  // Ignored if missing in CI
}

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!connectionString) {
  console.log("No DATABASE_URL or DIRECT_URL found, skipping seed execution.");
  process.exit(0);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

function hashKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function runSeed(): Promise<void> {
  console.log("Starting AP TransitOS deterministic seed (version 20260923)...");

  // 1. Settings (defaults from docs/07 section 1)
  const defaultSettings: Record<string, unknown> = {
    "booking.holdMinutes": 10,
    "booking.maxPassengers": 6,
    "booking.daysAhead": 30,
    "booking.closeMinutesBefore": 10,
    "activation.opensMinutesBefore": 60,
    "activation.closesMinutesAfter": 30,
    "ticket.graceMinutesAfterArrival": 60,
    "gift.cutoffMinutesBefore": 120,
    "gift.maxTransfers": 1,
    "pass.activateWithinDays": 30,
    "qr.periodSec": 30,
    "qr.windowSteps": 1,
  };

  for (const [key, value] of Object.entries(defaultSettings)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue },
      update: { value: value as Prisma.InputJsonValue },
    });
  }
  console.log("Settings seeded.");

  // 2. Refund policy (docs/07 section 6)
  const refundPolicyName = "Standard AP Transport Refund Policy";
  const existingPolicy = await prisma.refundPolicy.findFirst({
    where: { name: refundPolicyName },
  });

  const defaultTiers = [
    { minHoursBefore: 24, percent: 90 },
    { minHoursBefore: 12, percent: 75 },
    { minHoursBefore: 1, percent: 50 },
    { minHoursBefore: 0, percent: 0 },
  ];

  if (!existingPolicy) {
    await prisma.refundPolicy.create({
      data: {
        name: refundPolicyName,
        tiers: defaultTiers,
        cancellationFeePaise: 0,
        isActive: true,
        validFrom: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
  }
  console.log("Refund policy seeded.");

  // 3. Districts (docs/19)
  const districtMap = new Map<string, string>();
  for (const dist of DISTRICTS) {
    const row = await prisma.district.upsert({
      where: { code: dist.code },
      create: { code: dist.code, nameEn: dist.nameEn, nameTe: dist.nameTe },
      update: { nameEn: dist.nameEn, nameTe: dist.nameTe },
    });
    districtMap.set(dist.code, row.id);
  }
  console.log(`Districts seeded: ${districtMap.size}`);

  // 4. Bus stands and stops (docs/19)
  const busStandMap = new Map<string, string>();
  const stopMap = new Map<string, { id: string; lat: number; lng: number }>();

  // Create bus stands first
  for (const s of STOPS) {
    if (s.isBusStand) {
      const distId = districtMap.get(s.districtCode)!;
      const stand = await prisma.busStand.upsert({
        where: { code: s.code },
        create: {
          code: s.code,
          nameEn: s.nameEn,
          nameTe: s.nameTe,
          districtId: distId,
          lat: s.lat,
          lng: s.lng,
        },
        update: {
          nameEn: s.nameEn,
          nameTe: s.nameTe,
          districtId: distId,
          lat: s.lat,
          lng: s.lng,
        },
      });
      busStandMap.set(s.code, stand.id);
    }
  }

  // Create stops
  for (const s of STOPS) {
    const distId = districtMap.get(s.districtCode)!;
    const busStandId = s.isBusStand ? busStandMap.get(s.code) : null;
    const stop = await prisma.stop.upsert({
      where: { code: s.code },
      create: {
        code: s.code,
        nameEn: s.nameEn,
        nameTe: s.nameTe,
        districtId: distId,
        busStandId: busStandId ?? undefined,
        lat: s.lat,
        lng: s.lng,
      },
      update: {
        nameEn: s.nameEn,
        nameTe: s.nameTe,
        districtId: distId,
        busStandId: busStandId ?? undefined,
        lat: s.lat,
        lng: s.lng,
      },
    });
    stopMap.set(s.code, { id: stop.id, lat: s.lat, lng: s.lng });
  }
  console.log(`Stops seeded: ${stopMap.size}, Bus stands: ${busStandMap.size}`);

  // 5. Depots (docs/19)
  const depotMap = new Map<string, string>();
  for (const dep of DEPOTS) {
    const distId = districtMap.get(dep.districtCode)!;
    const standId = busStandMap.get(dep.busStandCode)!;
    const row = await prisma.depot.upsert({
      where: { code: dep.code },
      create: {
        code: dep.code,
        nameEn: dep.nameEn,
        nameTe: dep.nameTe,
        districtId: distId,
        busStandId: standId,
      },
      update: {
        nameEn: dep.nameEn,
        nameTe: dep.nameTe,
        districtId: distId,
        busStandId: standId,
      },
    });
    depotMap.set(dep.code, row.id);
  }
  console.log(`Depots seeded: ${depotMap.size}`);

  // 6. Bus types and fare rules (docs/19)
  const busTypeMap = new Map<string, string>();
  for (const bt of BUS_TYPES) {
    const row = await prisma.busType.upsert({
      where: { serviceType: bt.serviceType },
      create: {
        serviceType: bt.serviceType,
        nameEn: bt.nameEn,
        nameTe: bt.nameTe,
        isAc: bt.isAc,
        totalSeats: bt.totalSeats,
        seatLayout: bt.layout as unknown as Prisma.InputJsonValue,
        freeTravelEligible: bt.freeTravelEligible,
      },
      update: {
        nameEn: bt.nameEn,
        nameTe: bt.nameTe,
        isAc: bt.isAc,
        totalSeats: bt.totalSeats,
        seatLayout: bt.layout as unknown as Prisma.InputJsonValue,
        freeTravelEligible: bt.freeTravelEligible,
      },
    });
    busTypeMap.set(bt.serviceType, row.id);

    // Upsert fare rule
    const existingRule = await prisma.fareRule.findFirst({
      where: { busTypeId: row.id },
    });
    if (existingRule) {
      // Keep the demo fares in line with docs/19 (base fare 0, per km with a minimum).
      await prisma.fareRule.update({
        where: { id: existingRule.id },
        data: {
          baseFarePaise: bt.baseFarePaise,
          perKmPaise: bt.perKmPaise,
          minFarePaise: bt.minFarePaise,
          reservationFeePaise: bt.reservationFeePaise,
        },
      });
    } else {
      await prisma.fareRule.create({
        data: {
          busTypeId: row.id,
          baseFarePaise: bt.baseFarePaise,
          perKmPaise: bt.perKmPaise,
          minFarePaise: bt.minFarePaise,
          reservationFeePaise: bt.reservationFeePaise,
          validFrom: new Date("2026-01-01T00:00:00.000Z"),
        },
      });
    }
  }
  console.log(`Bus types and fare rules seeded: ${busTypeMap.size}`);

  // 7. Pass types (docs/07 section 8)
  const standardServices: Array<
    "PALLEVELUGU" | "ULTRA_PALLEVELUGU" | "CITY_ORDINARY" | "METRO_EXPRESS" | "EXPRESS"
  > = ["PALLEVELUGU", "ULTRA_PALLEVELUGU", "CITY_ORDINARY", "METRO_EXPRESS", "EXPRESS"];

  const passTypes = [
    {
      kind: "WEEKLY" as const,
      nameEn: "Weekly Pass",
      nameTe: "వారపు పాస్",
      durationDays: 7,
      pricePaise: 45000,
      eligibleServiceTypes: standardServices,
      scheme: undefined,
    },
    {
      kind: "MONTHLY" as const,
      nameEn: "Monthly Pass",
      nameTe: "నెలవారీ పాస్",
      durationDays: 30,
      pricePaise: 160000,
      eligibleServiceTypes: standardServices,
      scheme: undefined,
    },
    {
      kind: "FREE_TRAVEL" as const,
      nameEn: "Free Travel Pass (Stree Shakti)",
      nameTe: "ఉచిత ప్రయాణ పాస్ (స్త్రీ శక్తి)",
      durationDays: 365,
      pricePaise: 0,
      eligibleServiceTypes: standardServices,
      scheme: "STREE_SHAKTI" as const,
    },
  ];

  for (const pt of passTypes) {
    const existing = await prisma.passType.findFirst({
      where: { kind: pt.kind },
    });
    if (existing) {
      await prisma.passType.update({
        where: { id: existing.id },
        data: {
          nameEn: pt.nameEn,
          nameTe: pt.nameTe,
          durationDays: pt.durationDays,
          pricePaise: pt.pricePaise,
          eligibleServiceTypes: pt.eligibleServiceTypes,
          scheme: pt.scheme,
        },
      });
    } else {
      await prisma.passType.create({
        data: {
          kind: pt.kind,
          nameEn: pt.nameEn,
          nameTe: pt.nameTe,
          durationDays: pt.durationDays,
          pricePaise: pt.pricePaise,
          eligibleServiceTypes: pt.eligibleServiceTypes,
          scheme: pt.scheme,
          isActive: true,
        },
      });
    }
  }
  console.log("Pass types seeded.");

  // 8. Routes and RouteStops (docs/19)
  const routeMap = new Map<string, { id: string; durationMinutes: number }>();

  for (const def of ROUTE_DEFS) {
    const depotId = depotMap.get(def.depotCode)!;
    const originStopCode = def.stops[0]!.stopCode;
    const destStopCode = def.stops[def.stops.length - 1]!.stopCode;
    const originStop = stopMap.get(originStopCode)!;
    const destStop = stopMap.get(destStopCode)!;
    const distanceKm = def.stops[def.stops.length - 1]!.kmFromOrigin;
    const durationMinutes = def.stops[def.stops.length - 1]!.minutesFromOrigin;

    // Build straight-line polyline
    const coords: [number, number][] = def.stops.map((s) => {
      const stop = stopMap.get(s.stopCode)!;
      return [stop.lat, stop.lng];
    });
    const polyline = encodePolyline(coords);

    // Forward route
    const forwardRoute = await prisma.route.upsert({
      where: { code: def.code },
      create: {
        code: def.code,
        nameEn: def.nameEn,
        nameTe: def.nameTe,
        originStopId: originStop.id,
        destinationStopId: destStop.id,
        distanceKm,
        polyline,
        depotId,
        isActive: true,
      },
      update: {
        nameEn: def.nameEn,
        nameTe: def.nameTe,
        originStopId: originStop.id,
        destinationStopId: destStop.id,
        distanceKm,
        polyline,
        depotId,
        isActive: true,
      },
    });
    routeMap.set(def.code, { id: forwardRoute.id, durationMinutes });

    // Forward RouteStops
    for (let seq = 0; seq < def.stops.length; seq++) {
      const s = def.stops[seq]!;
      const stopInfo = stopMap.get(s.stopCode)!;
      await prisma.routeStop.upsert({
        where: {
          routeId_seq: { routeId: forwardRoute.id, seq: seq + 1 },
        },
        create: {
          routeId: forwardRoute.id,
          stopId: stopInfo.id,
          seq: seq + 1,
          kmFromOrigin: s.kmFromOrigin,
          minutesFromOrigin: s.minutesFromOrigin,
          isBoarding: true,
          isDropping: true,
        },
        update: {
          stopId: stopInfo.id,
          kmFromOrigin: s.kmFromOrigin,
          minutesFromOrigin: s.minutesFromOrigin,
        },
      });
    }

    // Reverse route
    const reversedStops = [...def.stops].reverse();
    const reverseCoords: [number, number][] = reversedStops.map((s) => {
      const stop = stopMap.get(s.stopCode)!;
      return [stop.lat, stop.lng];
    });
    const reversePolyline = encodePolyline(reverseCoords);

    const reverseRoute = await prisma.route.upsert({
      where: { code: def.reverseCode },
      create: {
        code: def.reverseCode,
        nameEn: def.reverseNameEn,
        nameTe: def.reverseNameTe,
        originStopId: destStop.id,
        destinationStopId: originStop.id,
        distanceKm,
        polyline: reversePolyline,
        depotId,
        isActive: true,
      },
      update: {
        nameEn: def.reverseNameEn,
        nameTe: def.reverseNameTe,
        originStopId: destStop.id,
        destinationStopId: originStop.id,
        distanceKm,
        polyline: reversePolyline,
        depotId,
        isActive: true,
      },
    });
    routeMap.set(def.reverseCode, { id: reverseRoute.id, durationMinutes });

    // Reverse RouteStops with mirrored km and minutes
    for (let seq = 0; seq < reversedStops.length; seq++) {
      const s = reversedStops[seq]!;
      const stopInfo = stopMap.get(s.stopCode)!;
      const kmFromOrigin = distanceKm - s.kmFromOrigin;
      const minsFromOrigin = durationMinutes - s.minutesFromOrigin;

      await prisma.routeStop.upsert({
        where: {
          routeId_seq: { routeId: reverseRoute.id, seq: seq + 1 },
        },
        create: {
          routeId: reverseRoute.id,
          stopId: stopInfo.id,
          seq: seq + 1,
          kmFromOrigin: Math.round(kmFromOrigin * 10) / 10,
          minutesFromOrigin: minsFromOrigin,
          isBoarding: true,
          isDropping: true,
        },
        update: {
          stopId: stopInfo.id,
          kmFromOrigin: Math.round(kmFromOrigin * 10) / 10,
          minutesFromOrigin: minsFromOrigin,
        },
      });
    }
  }
  console.log(`Routes seeded: ${routeMap.size}`);

  // 9. Demo accounts (docs/08)
  const knlDepotId = depotMap.get("D-KNL")!;
  const knlDistrictId = districtMap.get("KNL")!;

  const demoUsers = [
    { email: "citizen@aptransit.test", name: "Citizen Ravi", role: "CITIZEN" as const },
    { email: "citizen2@aptransit.test", name: "Citizen Lakshmi", role: "CITIZEN" as const },
    { email: "driver.knl@aptransit.test", name: "Driver Srinivas", role: "DRIVER" as const, depotId: knlDepotId },
    { email: "conductor.knl@aptransit.test", name: "Conductor Prasad", role: "CONDUCTOR" as const, depotId: knlDepotId },
    { email: "staff.knl@aptransit.test", name: "Staff Venkat", role: "DEPOT_STAFF" as const, depotId: knlDepotId },
    { email: "manager.knl@aptransit.test", name: "Manager Ramesh", role: "DEPOT_MANAGER" as const, depotId: knlDepotId },
    { email: "officer.knl@aptransit.test", name: "Officer Anusha", role: "DISTRICT_OFFICER" as const, districtId: knlDistrictId },
    { email: "transport@aptransit.test", name: "Officer Chandrasekhar", role: "TRANSPORT_OFFICER" as const },
    { email: "admin@aptransit.test", name: "Admin AP", role: "STATE_ADMIN" as const },
    { email: "root@aptransit.test", name: "Super Admin", role: "SUPER_ADMIN" as const },
  ];

  const userMap = new Map<string, string>();
  for (const u of demoUsers) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      create: {
        email: u.email,
        name: u.name,
        preferredLocale: "en",
      },
      update: {
        name: u.name,
      },
    });
    userMap.set(u.email, user.id);

    // User roles
    const existingRole = await prisma.userRole.findFirst({
      where: {
        userId: user.id,
        role: u.role,
        depotId: u.depotId ?? null,
        districtId: u.districtId ?? null,
      },
    });
    if (!existingRole) {
      await prisma.userRole.create({
        data: {
          userId: user.id,
          role: u.role,
          depotId: u.depotId,
          districtId: u.districtId,
        },
      });
    }
  }
  console.log("Demo accounts seeded.");

  // 10. Driver and Conductor staff records
  const driverUserId = userMap.get("driver.knl@aptransit.test")!;
  const conductorUserId = userMap.get("conductor.knl@aptransit.test")!;

  const driverRow = await prisma.driver.upsert({
    where: { userId: driverUserId },
    create: {
      userId: driverUserId,
      depotId: knlDepotId,
      employeeCode: "EMP-DRV-001",
      licenseNo: "AP21-2015-0045231",
    },
    update: {
      depotId: knlDepotId,
      licenseNo: "AP21-2015-0045231",
    },
  });

  const conductorRow = await prisma.conductor.upsert({
    where: { userId: conductorUserId },
    create: {
      userId: conductorUserId,
      depotId: knlDepotId,
      employeeCode: "EMP-CON-001",
    },
    update: {
      depotId: knlDepotId,
    },
  });

  // Approved driver devices for simulator (docs/08, docs/19)
  const deviceKeys = [
    { label: "Simulator Device 1", rawKey: "sim_driver_key_kurnool_01" },
    { label: "Simulator Device 2", rawKey: "sim_driver_key_kurnool_02" },
  ];

  for (const dev of deviceKeys) {
    const keyHash = hashKey(dev.rawKey);
    await prisma.device.upsert({
      where: { deviceKeyHash: keyHash },
      create: {
        userId: driverUserId,
        label: dev.label,
        deviceKeyHash: keyHash,
        approvedAt: new Date("2026-09-01T00:00:00.000Z"),
        approvedById: userMap.get("manager.knl@aptransit.test"),
      },
      update: {
        userId: driverUserId,
        label: dev.label,
      },
    });
  }
  console.log("Approved driver devices registered.");

  // 11. Buses per depot (fictional AP 39 Z registrations)
  const expressTypeId = busTypeMap.get("EXPRESS")!;
  const palleveluguTypeId = busTypeMap.get("PALLEVELUGU")!;
  const superLuxuryTypeId = busTypeMap.get("SUPER_LUXURY")!;
  const metroExpressTypeId = busTypeMap.get("METRO_EXPRESS")!;
  const cityOrdinaryTypeId = busTypeMap.get("CITY_ORDINARY")!;

  let busNumberIndex = 101;
  const buses: { id: string; depotId: string; busTypeId: string; status: "IDLE" | "RUNNING" | "MAINTENANCE" | "BREAKDOWN" }[] = [];

  for (const dep of DEPOTS) {
    const dId = depotMap.get(dep.code)!;
    for (let b = 0; b < dep.busCount; b++) {
      const regNo = `AP 39 Z ${busNumberIndex++}`;
      let btId = expressTypeId;
      if (b % 4 === 1) btId = palleveluguTypeId;
      else if (b % 4 === 2) btId = superLuxuryTypeId;
      else if (dep.code === "D-VJA") btId = metroExpressTypeId;
      else if (dep.code === "D-VSP") btId = cityOrdinaryTypeId;

      // Status assignment: 2 in MAINTENANCE, 1 BREAKDOWN at Kurnool
      let status: "IDLE" | "RUNNING" | "MAINTENANCE" | "BREAKDOWN" = "IDLE";
      if (dep.code === "D-KNL" && b === 0) {
        status = "BREAKDOWN";
      } else if (dep.code === "D-KNL" && (b === 1 || b === 2)) {
        status = "MAINTENANCE";
      } else if (b % 2 === 0) {
        status = "RUNNING";
      }

      const bus = await prisma.bus.upsert({
        where: { regNo },
        create: {
          regNo,
          busTypeId: btId,
          depotId: dId,
          status,
          odometerKm: 45000 + b * 1250,
        },
        update: {
          busTypeId: btId,
          depotId: dId,
          status,
        },
      });
      buses.push({ id: bus.id, depotId: dId, busTypeId: btId, status });
    }
  }
  console.log(`Buses seeded: ${buses.length}`);

  // 12. Timetables (docs/19, TIMETABLE_DEFS in seed-data.ts)
  const timetableDefs = TIMETABLE_DEFS;

  const timetableInputs: TimetableInput[] = [];
  for (const td of timetableDefs) {
    const route = routeMap.get(td.routeCode);
    const busTypeId = busTypeMap.get(td.serviceType);
    if (!route || !busTypeId) continue;

    const existing = await prisma.timetable.findFirst({
      where: {
        routeId: route.id,
        busTypeId,
        departureLocal: td.departureLocal,
      },
    });

    let ttId: string;
    if (existing) {
      ttId = existing.id;
    } else {
      const created = await prisma.timetable.create({
        data: {
          routeId: route.id,
          busTypeId,
          departureLocal: td.departureLocal,
          daysMask: 127,
          validFrom: new Date("2026-01-01T00:00:00.000Z"),
          isActive: true,
        },
      });
      ttId = created.id;
    }

    timetableInputs.push({
      id: ttId,
      routeId: route.id,
      routeCode: td.routeCode,
      busTypeId,
      departureLocal: td.departureLocal,
      daysMask: 127,
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
      validTo: null,
      isActive: true,
      durationMinutes: route.durationMinutes,
    });
  }
  // Timetables from an older seed that docs/19 no longer lists stop generating trips
  await prisma.timetable.updateMany({
    where: { id: { notIn: timetableInputs.map((t) => t.id) }, isActive: true },
    data: { isActive: false },
  });
  console.log(`Timetables seeded: ${timetableInputs.length}`);

  // 13. Generate trips for today to today plus 7 days
  const nowUtc = new Date();
  const todayIstStr = formatIstDate(nowUtc);
  const plus7Date = new Date(nowUtc.getTime() + 7 * 24 * 60 * 60 * 1000);
  const plus7IstStr = formatIstDate(plus7Date);

  const tripRows = generateTripsForTimetables(timetableInputs, todayIstStr, plus7IstStr);
  console.log(`Generated ${tripRows.length} trips from ${todayIstStr} to ${plus7IstStr}.`);

  // Available buses at Kurnool for initial assignment
  const availableBuses = buses.filter((b) => b.depotId === knlDepotId && b.status !== "BREAKDOWN" && b.status !== "MAINTENANCE");

  // docs/19 has about 450 trips a day, so insert in batches (one row at a time takes minutes on Neon).
  const BATCH = 500;
  for (let i = 0; i < tripRows.length; i += BATCH) {
    await prisma.trip.createMany({
      data: tripRows.slice(i, i + BATCH).map((t) => ({
        code: t.code,
        timetableId: t.timetableId,
        routeId: t.routeId,
        busTypeId: t.busTypeId,
        serviceDate: t.serviceDate,
        scheduledDepartureAt: t.scheduledDepartureAt,
        scheduledArrivalAt: t.scheduledArrivalAt,
        status: t.status,
        delayMinutes: t.delayMinutes,
        hasOpenIncident: t.hasOpenIncident,
      })),
      skipDuplicates: true,
    });
  }

  // Initial assignment for trips that have none yet (idempotent on re-run)
  if (availableBuses.length > 0) {
    const assignedById = userMap.get("manager.knl@aptransit.test")!;
    let busAssignIndex = 0;
    for (let i = 0; i < tripRows.length; i += BATCH) {
      const unassigned = await prisma.trip.findMany({
        where: { code: { in: tripRows.slice(i, i + BATCH).map((t) => t.code) }, assignments: { none: {} } },
        select: { id: true, scheduledDepartureAt: true },
        orderBy: { scheduledDepartureAt: "asc" },
      });
      if (unassigned.length === 0) continue;
      await prisma.tripAssignment.createMany({
        data: unassigned.map((trip) => ({
          tripId: trip.id,
          busId: availableBuses[busAssignIndex++ % availableBuses.length]!.id,
          driverId: driverRow.id,
          conductorId: conductorRow.id,
          reason: "INITIAL" as const,
          assignedById,
          startedAt: trip.scheduledDepartureAt,
        })),
      });
    }
  }
  console.log("Trips and initial assignments seeded.");

  const args = process.argv.slice(2);
  const historyIdx = args.indexOf("--history");
  if (historyIdx !== -1) {
    const days = parseInt(args[historyIdx + 1]!, 10) || 14;
    const { generateHistory } = await import("./seed-history.js");
    await generateHistory(prisma, days);
  }

  console.log("\nDeterministic seed complete!");
  console.log("Approved Simulator Device Keys for Driver:");
  console.log("Device 1 Key:", deviceKeys[0]!.rawKey);
  console.log("Device 2 Key:", deviceKeys[1]!.rawKey);
}

// When executed directly via tsx
if (process.argv[1]?.endsWith("seed.ts")) {
  runSeed()
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (e) => {
      console.error("Seed failed:", e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
