import { formatIstDate } from "@aptransit/shared";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

try {
  process.loadEnvFile(".env");
} catch {
  /* CI supplies the environment. */
}
if (process.env.APP_ENV !== "development") throw new Error("demo-tracking is development only");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function main() {
  const assignment = await prisma.tripAssignment.findFirst({
    where: { endedAt: null, driver: { user: { email: "driver.knl@aptransit.test" } } },
    include: {
      trip: { include: { route: { include: { routeStops: { orderBy: { seq: "asc" } } } } } },
    },
  });
  if (!assignment) throw new Error("Seeded driver assignment missing");
  const now = new Date();
  const duration =
    assignment.trip.scheduledArrivalAt.getTime() - assignment.trip.scheduledDepartureAt.getTime();
  await prisma.trip.update({
    where: { id: assignment.tripId },
    data: {
      serviceDate: new Date(`${formatIstDate(now)}T00:00:00Z`),
      scheduledDepartureAt: now,
      scheduledArrivalAt: new Date(now.getTime() + duration),
      actualDepartureAt: null,
      actualArrivalAt: null,
      status: "SCHEDULED",
      lastStopSeq: null,
      delayMinutes: 0,
      hasOpenIncident: false,
    },
  });
  await prisma.bus.update({ where: { id: assignment.busId }, data: { status: "IDLE" } });
  process.stdout.write(assignment.tripId);
}
main().finally(() => prisma.$disconnect());
