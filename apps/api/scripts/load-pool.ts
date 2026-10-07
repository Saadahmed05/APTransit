/* eslint-disable no-console */
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { formatIstDate, generateTicketCode } from "@aptransit/shared";
import { PrismaPg } from "@prisma/adapter-pg";
import * as jose from "jose";
import { sealSecret } from "../src/common/crypto/secret-box";
import { PrismaClient } from "../src/generated/prisma/client";

// Day 17 load test helper (docs/14 "Validate API"). The API allows 120 scans per conductor per
// minute (docs/12), so 30 rps needs several conductors, as in real life. This creates CONDUCTORS
// load test conductors (loadtest+NN@aptransit.test), gives each one of today's trips (RUNNING,
// their open assignment), puts TICKETS ACTIVE tickets on each trip, and writes ticket numbers,
// rotating secrets and a 1 hour access token per conductor to .local/load-pool.json for
// scripts/load/validate.ts. Development and staging only; rerunning adds new trips.
//   pnpm load:pool [conductors] [ticketsPerTrip]

try {
  process.loadEnvFile(".env");
} catch {
  // rely on the environment
}
if (process.env.APP_ENV === "production") {
  console.error("load:pool never runs in production.");
  process.exit(1);
}
const conductors = Number.parseInt(process.argv[2] ?? "20", 10);
const perTrip = Number.parseInt(process.argv[3] ?? "10", 10);
const qrKey = process.env.QR_SECRET_KEY;
const jwtSecret = process.env.JWT_SECRET;
const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!qrKey || !jwtSecret || !connectionString || !(conductors > 0) || !(perTrip > 0)) {
  console.error("Needs QR_SECRET_KEY, JWT_SECRET, DATABASE_URL and positive counts.");
  process.exit(1);
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main(): Promise<void> {
  const citizen = await prisma.user.findUniqueOrThrow({ where: { email: "citizen2@aptransit.test" } });
  const manager = await prisma.user.findUniqueOrThrow({ where: { email: "manager.knl@aptransit.test" } });
  const today = new Date(`${formatIstDate(new Date())}T00:00:00.000Z`);
  const trips = await prisma.trip.findMany({
    where: { serviceDate: today, status: "SCHEDULED", assignments: { some: { endedAt: null } } },
    include: {
      route: { include: { routeStops: { orderBy: { seq: "asc" } } } },
      assignments: { where: { endedAt: null }, take: 1 },
    },
    orderBy: { scheduledDepartureAt: "desc" },
    take: conductors,
  });
  if (trips.length < conductors) throw new Error(`Only ${trips.length} scheduled trips today. Run pnpm db:seed first.`);

  const now = new Date();
  const validUntil = new Date(now.getTime() + 6 * 3600_000);
  const secretKey = new TextEncoder().encode(jwtSecret);
  const out: Array<{ token: string; tripId: string; tickets: Array<{ ticketNumber: string; rotSecret: string }> }> = [];

  for (const [n, trip] of trips.entries()) {
    const email = `loadtest+${String(n + 1).padStart(2, "0")}@aptransit.test`;
    const depotId = trip.route.depotId;
    const user = await prisma.user.upsert({ where: { email }, create: { email, name: `Load test ${n + 1}` }, update: {} });
    if (!(await prisma.userRole.findFirst({ where: { userId: user.id, role: "CONDUCTOR", depotId } }))) {
      await prisma.userRole.create({ data: { userId: user.id, role: "CONDUCTOR", depotId } });
    }
    const conductor = await prisma.conductor.upsert({
      where: { userId: user.id },
      create: { userId: user.id, depotId, employeeCode: `LOAD-${String(n + 1).padStart(3, "0")}` },
      update: { depotId },
    });
    // The load conductor takes over this trip: end every open assignment of it, and of the conductor
    const open = trip.assignments[0]!;
    await prisma.tripAssignment.updateMany({ where: { OR: [{ tripId: trip.id }, { conductorId: conductor.id }], endedAt: null }, data: { endedAt: now } });
    await prisma.tripAssignment.create({
      data: { tripId: trip.id, busId: open.busId, driverId: open.driverId, conductorId: conductor.id, assignedById: manager.id, startedAt: now },
    });
    await prisma.trip.update({ where: { id: trip.id }, data: { status: "RUNNING", actualDepartureAt: now } });

    const stops = trip.route.routeStops;
    const tickets: Array<{ ticketNumber: string; rotSecret: string }> = [];
    await prisma.ticket.createMany({
      data: Array.from({ length: perTrip }, () => {
        const secret = randomBytes(32);
        const code = generateTicketCode();
        tickets.push({ ticketNumber: code, rotSecret: secret.toString("base64url") });
        return {
          code,
          type: "SINGLE" as const,
          status: "ACTIVE" as const,
          holderUserId: citizen.id,
          originalUserId: citizen.id,
          tripId: trip.id,
          routeId: trip.routeId,
          boardingStopId: stops[0]!.stopId,
          droppingStopId: stops.at(-1)!.stopId,
          farePaise: 0,
          activatedAt: now,
          validUntil,
          expiresAt: validUntil,
          qrSecret: sealSecret(secret, qrKey!),
          giftable: false,
        };
      }),
    });
    const token = await new jose.SignJWT({ roles: [{ role: "CONDUCTOR", depotId, districtId: null }] })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(secretKey);
    out.push({ token, tripId: trip.id, tickets });
  }

  const file = resolve(process.env.INIT_CWD ?? resolve(process.cwd(), "../.."), ".local/load-pool.json");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ createdAt: now.toISOString(), conductors: out }, null, 2));
  console.log(`${conductors} load conductors on RUNNING trips, ${perTrip} ACTIVE tickets each. Pool: ${file}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
