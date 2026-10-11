/* eslint-disable no-console */
import { PLATFORM_TIME_ZONE } from "@aptransit/shared";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

// Dev only demo helper (Day 7 sync decision): moves a ticket's trip so its boarding stop departs
// in N minutes (default 30), which puts the ticket inside its activation window.
//   pnpm --filter api demo:window <ticket code or id> [minutes]
//   pnpm --filter api demo:window <ticket code or id> reset   (back to the timetable time; E2E-3 runs it after)
// Refuses to run when APP_ENV is staging or production.

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: rely on the environment
}

const [ticketRef, minutesArg] = process.argv.slice(2);
const reset = minutesArg === "reset";
const minutes = reset ? 0 : Number.parseInt(minutesArg ?? "30", 10);
if (!ticketRef || !Number.isFinite(minutes)) {
  console.error("Usage: pnpm --filter api demo:window <ticket code or id> [minutes | reset]");
  process.exit(1);
}
if (process.env.APP_ENV !== "development") {
  console.error("demo:window only runs with APP_ENV=development.");
  process.exit(1);
}

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main(): Promise<void> {
  const ticket = await prisma.ticket.findFirst({
    where: { OR: [{ id: ticketRef }, { code: ticketRef }] },
    include: { trip: { include: { route: { include: { routeStops: true } } } } },
  });
  if (!ticket) throw new Error(`No ticket ${ticketRef}`);

  if (reset) {
    // Timetable departure (IST wall clock) on the trip's service date, stored as UTC
    const shifted = await prisma.$executeRaw`
      WITH m AS (
        SELECT t.id, (((t."serviceDate"::date + tt."departureLocal"::time) AT TIME ZONE ${PLATFORM_TIME_ZONE}) AT TIME ZONE 'UTC') - t."scheduledDepartureAt" AS shift
        FROM trips t JOIN timetables tt ON tt.id = t."timetableId" WHERE t.id = ${ticket.tripId}
      ), trip AS (
        UPDATE trips t SET "scheduledDepartureAt" = t."scheduledDepartureAt" + m.shift, "scheduledArrivalAt" = t."scheduledArrivalAt" + m.shift, "updatedAt" = now()
        FROM m WHERE t.id = m.id RETURNING t.id
      )
      UPDATE tickets k SET "expiresAt" = k."expiresAt" + m.shift FROM m WHERE k."tripId" = m.id AND k.status = 'BOOKED'`;
    console.log(`Trip ${ticket.trip.code}: back on its timetable time (${shifted} booked tickets updated).`);
    return;
  }

  const boardingMinutes = ticket.trip.route.routeStops.find((rs) => rs.stopId === ticket.boardingStopId)?.minutesFromOrigin ?? 0;
  const departure = new Date(Date.now() + (minutes - boardingMinutes) * 60_000);
  const shift = departure.getTime() - ticket.trip.scheduledDepartureAt.getTime();

  await prisma.trip.update({
    where: { id: ticket.tripId },
    data: {
      scheduledDepartureAt: departure,
      scheduledArrivalAt: new Date(ticket.trip.scheduledArrivalAt.getTime() + shift),
    },
  });
  // Keep BOOKED tickets on this trip valid against the new times
  await prisma.$executeRaw`UPDATE tickets SET "expiresAt" = "expiresAt" + (${shift} * interval '1 millisecond') WHERE "tripId" = ${ticket.tripId} AND status = 'BOOKED'`;

  console.log(`Trip ${ticket.trip.code}: boarding stop now departs at ${new Date(Date.now() + minutes * 60_000).toISOString()}.`);
}

main()
  .catch((err: unknown) => {
    console.error((err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
