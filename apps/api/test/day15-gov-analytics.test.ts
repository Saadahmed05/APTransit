import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../src/common/auth/auth.types";
import { ScopeService } from "../src/common/services/scope.service";
import { AnalyticsService } from "../src/modules/analytics/analytics.service";
import { ReportsService } from "../src/modules/reports/reports.service";
import type { PrismaService } from "../src/prisma/prisma.service";

describe("Day 15 Backend: Gov, Analytics, Reports", () => {
  describe("Demand thresholds math", () => {
    it("assigns LOW when load factor is strictly under 50%", async () => {
      const mockPrisma = {
        trip: {
          findMany: vi.fn().mockResolvedValue([
            {
              scheduledDepartureAt: new Date("2026-10-06T06:00:00.000Z"), // MORNING
              busType: { totalSeats: 50 },
              tickets: [{ passengerCount: 20 }], // 20 / 50 = 40%
            },
          ]),
        },
      };

      const service = new AnalyticsService(mockPrisma as unknown as PrismaService);
      const user = { id: "u1", roles: [{ role: "STATE_ADMIN" }] } as AuthenticatedUser;
      const res = await service.demand(user, "route1", "2026-10-01", "2026-10-06");

      const morning = res.find((b) => b.band === "MORNING");
      expect(morning).toBeDefined();
      expect(morning!.loadFactorPct).toBe(40);
      expect(morning!.level).toBe("LOW");
    });

    it("assigns MEDIUM when load factor is between 50% and 80%", async () => {
      const mockPrisma = {
        trip: {
          findMany: vi.fn().mockResolvedValue([
            {
              scheduledDepartureAt: new Date("2026-10-06T13:00:00.000Z"), // AFTERNOON
              busType: { totalSeats: 40 },
              tickets: [{ passengerCount: 28 }], // 28 / 40 = 70%
            },
          ]),
        },
      };

      const service = new AnalyticsService(mockPrisma as unknown as PrismaService);
      const user = { id: "u1", roles: [{ role: "STATE_ADMIN" }] } as AuthenticatedUser;
      const res = await service.demand(user, "route1", "2026-10-01", "2026-10-06");

      const afternoon = res.find((b) => b.band === "AFTERNOON");
      expect(afternoon).toBeDefined();
      expect(afternoon!.loadFactorPct).toBe(70);
      expect(afternoon!.level).toBe("MEDIUM");
    });

    it("assigns HIGH when load factor is over 80%", async () => {
      const mockPrisma = {
        trip: {
          findMany: vi.fn().mockResolvedValue([
            {
              scheduledDepartureAt: new Date("2026-10-06T18:00:00.000Z"), // EVENING
              busType: { totalSeats: 40 },
              tickets: [{ passengerCount: 36 }], // 36 / 40 = 90%
            },
          ]),
        },
      };

      const service = new AnalyticsService(mockPrisma as unknown as PrismaService);
      const user = { id: "u1", roles: [{ role: "STATE_ADMIN" }] } as AuthenticatedUser;
      const res = await service.demand(user, "route1", "2026-10-01", "2026-10-06");

      const evening = res.find((b) => b.band === "EVENING");
      expect(evening).toBeDefined();
      expect(evening!.loadFactorPct).toBe(90);
      expect(evening!.level).toBe("HIGH");
    });
  });

  describe("District officer scope isolation", () => {
    const scope = new ScopeService();

    it("permits access when district officer queries their own district", () => {
      const officer = {
        id: "do_knl",
        roles: [{ role: "DISTRICT_OFFICER", districtId: "dist_knl" }],
      } as AuthenticatedUser;

      expect(() => scope.assertDistrictAccess(officer, "dist_knl")).not.toThrow();
    });

    it("throws FORBIDDEN when district officer queries another district", () => {
      const officer = {
        id: "do_knl",
        roles: [{ role: "DISTRICT_OFFICER", districtId: "dist_knl" }],
      } as AuthenticatedUser;

      expect(() => scope.assertDistrictAccess(officer, "dist_vja")).toThrowError(
        /Forbidden: district access denied/,
      );
    });

    it("permits statewide roles for any district", () => {
      const stateAdmin = {
        id: "sa_1",
        roles: [{ role: "STATE_ADMIN" }],
      } as AuthenticatedUser;

      expect(() => scope.assertDistrictAccess(stateAdmin, "dist_knl")).not.toThrow();
      expect(() => scope.assertDistrictAccess(stateAdmin, "dist_vja")).not.toThrow();
    });
  });

  describe("Reports CSV generation", () => {
    it("generates daily-operations CSV with UTF-8 BOM", async () => {
      const mockPrisma = {
        dailyStats: {
          findMany: vi.fn().mockResolvedValue([
            {
              date: new Date("2026-10-05T00:00:00.000Z"),
              districtId: "dist_knl",
              depotId: "dep_knl",
              routeId: "rt_1",
              tripsScheduled: 10,
              tripsCompleted: 10,
              tripsCancelled: 0,
              onTimePct: 90,
              avgDelayMin: 3.5,
              passengers: 450,
              revenuePaise: 4500000n,
            },
          ]),
        },
      };

      const reportsService = new ReportsService(mockPrisma as unknown as PrismaService);
      const csv = await reportsService.generateReport(
        "daily-operations",
        "2026-10-01",
        "2026-10-05",
      );

      expect(csv.startsWith("\uFEFF")).toBe(true);
      expect(csv).toContain("Date,District ID,Depot ID,Route ID");
      expect(csv).toContain("2026-10-05,dist_knl,dep_knl,rt_1,10,10,0,90,3.5,450,45000");
    });
  });
});
