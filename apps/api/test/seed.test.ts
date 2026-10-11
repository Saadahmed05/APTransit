import { PrismaPg } from "@prisma/adapter-pg";
import { describe, expect, it } from "vitest";
import { PrismaClient } from "../src/generated/prisma/client";
import { runSeed } from "../prisma/seed";

const testDbUrl = process.env.TEST_DATABASE_URL;
// The Telangana stub (`--with-tg`, D-034) may be in the same database: count AP only
const AP_ONLY = { where: { state: { code: "AP" } } };

describe.skipIf(!testDbUrl)("Database seed", () => {
  it(
    "seeds AP network deterministically and assert counts",
    async () => {
      const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: testDbUrl }),
      });

      try {
        await runSeed();

        const districtCount = await prisma.district.count(AP_ONLY);
        expect(districtCount).toBe(10);

        const depotCount = await prisma.depot.count({ where: { district: AP_ONLY.where } });
        expect(depotCount).toBe(6);

        const routeCount = await prisma.route.count();
        expect(routeCount).toBe(12);

        // Every route has ordered stops
        const routes = await prisma.route.findMany({
          include: { routeStops: { orderBy: { seq: "asc" } } },
        });
        expect(routes).toHaveLength(12);
        for (const route of routes) {
          expect(route.routeStops.length).toBeGreaterThanOrEqual(3);
          for (let i = 0; i < route.routeStops.length; i++) {
            expect(route.routeStops[i]!.seq).toBe(i + 1);
          }
        }

        // Trips exist
        const tripCount = await prisma.trip.count();
        expect(tripCount).toBeGreaterThan(0);

        // Idempotency: running seed a second time should not alter counts
        await runSeed();
        const secondDistrictCount = await prisma.district.count(AP_ONLY);
        const secondRouteCount = await prisma.route.count();
        const secondTripCount = await prisma.trip.count();

        expect(secondDistrictCount).toBe(10);
        expect(secondRouteCount).toBe(12);
        expect(secondTripCount).toBe(tripCount);
      } finally {
        await prisma.$disconnect();
      }
    },
    60000,
  );
});
