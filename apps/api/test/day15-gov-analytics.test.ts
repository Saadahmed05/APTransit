import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../src/common/auth/auth.types";
import { depotScopeWhere, isPlatformWide } from "../src/common/services/scope.service";
import { AnalyticsService, demandBands, worstRoutes } from "../src/modules/analytics/analytics.service";
import { areaRows, countTrips, GovService, sumRows } from "../src/modules/gov/gov.service";
import { csvLine, escapeCsvField, formatCsvWithBom, rupees } from "../src/modules/reports/csv-helper";
import { ReportsService } from "../src/modules/reports/reports.service";
import { buildDailyStats, type DailyStatsRow, type RollupsService, type TripFact } from "../src/modules/rollups/rollups.service";
import type { TrackingService } from "../src/modules/tracking/tracking.service";
import type { PrismaService } from "../src/prisma/prisma.service";

const officer: AuthenticatedUser = { id: "do_knl", roles: [{ role: "DISTRICT_OFFICER", districtId: "dist_knl" }] };
const transport: AuthenticatedUser = { id: "tof", roles: [{ role: "TRANSPORT_OFFICER", stateId: "state_ap" }] };
const superAdmin: AuthenticatedUser = { id: "root", roles: [{ role: "SUPER_ADMIN" }] };
const manager: AuthenticatedUser = { id: "dm_knl", roles: [{ role: "DEPOT_MANAGER", depotId: "dep_knl" }] };
const citizen: AuthenticatedUser = { id: "cit", roles: [{ role: "CITIZEN" }] };

const DEPOTS = [
  { id: "dep_knl", districtId: "dist_knl" },
  { id: "dep_ndl", districtId: "dist_knl" },
  { id: "dep_vja", districtId: "dist_ntr" },
];

/** Prisma double for scope lookups: evaluates the depot where clause that depotScopeWhere builds. */
function depotFinder() {
  return vi.fn(async (args?: { where?: { OR?: Array<{ id?: string; districtId?: string }>; id?: { in: string[] } } }) => {
    const where = args?.where;
    if (!where || Object.keys(where).length === 0) return DEPOTS;
    if (where.id?.in) return DEPOTS.filter((d) => where.id!.in.includes(d.id));
    return DEPOTS.filter((d) => where.OR?.some((o) => o.id === d.id || o.districtId === d.districtId));
  });
}

const fact = (over: Partial<TripFact>): TripFact => ({
  routeId: "rt_1",
  routeCode: "KNL-VJA-01",
  depotId: "dep_knl",
  districtId: "dist_knl",
  stateId: "state_ap",
  status: "COMPLETED",
  delayMinutes: 0,
  tickets: 10,
  passScans: 0,
  capturedPaise: 0n,
  refundedPaise: 0n,
  incidents: 0,
  ...over,
});

describe("Day 15: rollups", () => {
  const date = new Date("2026-10-05T00:00:00.000Z");
  const rows = buildDailyStats(
    date,
    [
      fact({ delayMinutes: 2, tickets: 30, passScans: 4, capturedPaise: 300_000n, refundedPaise: 20_000n, incidents: 1 }),
      fact({ delayMinutes: 12, tickets: 20, capturedPaise: 200_000n }),
      fact({ status: "CANCELLED", tickets: 0, capturedPaise: 50_000n, refundedPaise: 50_000n }),
      fact({ routeId: "rt_2", routeCode: "VJA-GNT-01", depotId: "dep_vja", districtId: "dist_ntr", tickets: 40, capturedPaise: 100_000n }),
    ],
    {
      complaints: [
        { depotId: "dep_knl", routeCode: "KNL-VJA-01" },
        { depotId: "dep_ndl", routeCode: null },
        { depotId: null, routeCode: null },
      ],
      depotDistrict: new Map(DEPOTS.map((d) => [d.id, d.districtId])),
      districtState: new Map([["dist_knl", "state_ap"], ["dist_ntr", "state_ap"]]),
      stateIds: ["state_ap"],
      passesActive: new Map([["state_ap", 55]]),
    },
  );
  const routeRow = rows.find((r) => r.routeId === "rt_1")!;
  const state = rows.find((r) => !r.routeId && !r.depotId && !r.districtId)!;

  it("computes revenue as captured minus refunded", () => {
    expect(routeRow.revenuePaise).toBe(480_000n);
    expect(state.revenuePaise).toBe(580_000n);
  });

  it("counts on time as completed trips under 5 minutes late, delay over completed trips only", () => {
    expect(routeRow.tripsScheduled).toBe(3);
    expect(routeRow.tripsCompleted).toBe(2);
    expect(routeRow.tripsCancelled).toBe(1);
    expect(routeRow.onTimePct).toBe(50);
    expect(routeRow.avgDelayMin).toBe(7);
  });

  it("counts pass scans as passengers but not as tickets sold", () => {
    expect(routeRow.ticketsSold).toBe(50);
    expect(routeRow.passengers).toBe(54);
  });

  it("writes route, depot, district and one state row, with complaints at each level", () => {
    expect(rows.filter((r) => r.routeId)).toHaveLength(2);
    expect(rows.find((r) => !r.routeId && r.depotId === "dep_ndl")!.complaints).toBe(1);
    expect(rows.find((r) => !r.routeId && !r.depotId && r.districtId === "dist_knl")!.complaints).toBe(2);
    expect(state.complaints).toBe(3);
    expect(state.passesActive).toBe(55);
    expect(routeRow.passesActive).toBe(0);
  });
});

describe("Day 15: demand bands", () => {
  it("uses IST hours and the fixed thresholds", () => {
    const bands = demandBands([
      { hour: 6, seats: 50, tickets: 20 },
      { hour: 13, seats: 40, tickets: 28 },
      { hour: 18, seats: 40, tickets: 36 },
      { hour: 22, seats: 40, tickets: 32 },
      { hour: 3, seats: 40, tickets: 32 },
    ]);
    expect(bands).toEqual([
      { band: "MORNING", loadFactorPct: 40, level: "LOW" },
      { band: "AFTERNOON", loadFactorPct: 70, level: "MEDIUM" },
      { band: "EVENING", loadFactorPct: 90, level: "HIGH" },
      { band: "NIGHT", loadFactorPct: 80, level: "MEDIUM" },
    ]);
  });

  it("reports LOW with zero load when a band has no trips", () => {
    expect(demandBands([]).every((b) => b.loadFactorPct === 0 && b.level === "LOW")).toBe(true);
  });
});

describe("Day 15: scope", () => {
  it("gives a district officer the depots of their district only", () => {
    expect(depotScopeWhere(officer, "gov:read")).toEqual({ OR: [{ districtId: "dist_knl" }] });
    expect(isPlatformWide(officer, "gov:read")).toBe(false);
  });

  it("gives state roles their state and the super admin everything (D-034)", () => {
    expect(depotScopeWhere(transport, "gov:read")).toEqual({ OR: [{ district: { stateId: "state_ap" } }] });
    expect(isPlatformWide(transport, "gov:read")).toBe(false);
    expect(depotScopeWhere(superAdmin, "gov:read")).toEqual({});
    expect(isPlatformWide(superAdmin, "gov:read")).toBe(true);
  });

  it("refuses callers without the permission", () => {
    expect(() => depotScopeWhere(citizen, "gov:read")).toThrow(/Permission denied/);
    expect(() => depotScopeWhere(manager, "gov:read")).toThrow(/Permission denied/);
  });

  it("does not let a depot role widen a district role (only roles holding the permission count)", () => {
    const both: AuthenticatedUser = {
      id: "x",
      roles: [
        { role: "DEPOT_STAFF", depotId: "dep_vja" },
        { role: "DISTRICT_OFFICER", districtId: "dist_knl" },
      ],
    };
    expect(depotScopeWhere(both, "gov:read")).toEqual({ OR: [{ districtId: "dist_knl" }] });
  });

  it("resolves whole districts for a district officer", async () => {
    const prisma = { depot: { findMany: depotFinder() } };
    const service = new AnalyticsService(prisma as unknown as PrismaService, {} as RollupsService);
    await expect(service.scopeFor(officer)).resolves.toEqual({
      all: false,
      stateIds: [],
      depotIds: ["dep_knl", "dep_ndl"],
      districtIds: ["dist_knl"],
    });
    await expect(service.scopeFor(manager, "report:export")).resolves.toEqual({
      all: false,
      stateIds: [],
      depotIds: ["dep_knl"],
      districtIds: [],
    });
  });

  it("refuses a district officer another district's drill down", async () => {
    const prisma = {
      depot: { findMany: depotFinder() },
      district: { findUnique: vi.fn().mockResolvedValue({ id: "dist_ntr", depots: [] }) },
    };
    const analytics = new AnalyticsService(prisma as unknown as PrismaService, {} as RollupsService);
    const gov = new GovService(prisma as unknown as PrismaService, analytics, {} as TrackingService);
    await expect(gov.districtSummary(officer, "dist_ntr")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses demand for a route outside the scope", async () => {
    const prisma = {
      depot: { findMany: depotFinder() },
      route: { findUnique: vi.fn().mockResolvedValue({ depotId: "dep_vja" }) },
    };
    const analytics = new AnalyticsService(prisma as unknown as PrismaService, {} as RollupsService);
    await expect(analytics.demand(officer, "rt_vja", "2026-10-01", "2026-10-05")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a range that ends before it starts or is too long", () => {
    const analytics = new AnalyticsService({} as PrismaService, {} as RollupsService);
    expect(() => analytics.range("2026-10-05", "2026-10-01")).toThrow(/on or before/);
    expect(() => analytics.range("2026-01-01", "2026-10-01")).toThrow(/at most/);
  });

  it("takes the area rows that cover a scope exactly once", () => {
    const row = (over: Partial<DailyStatsRow>): DailyStatsRow =>
      ({ stateId: "state_ap", routeId: null, depotId: null, districtId: null, passengers: 1, ...over }) as DailyStatsRow;
    const rows = [
      row({}),
      row({ districtId: "dist_knl", passengers: 10 }),
      row({ depotId: "dep_knl", districtId: "dist_knl" }),
      row({ routeId: "rt_1", depotId: "dep_knl", districtId: "dist_knl" }),
      row({ districtId: "dist_ntr" }),
    ];
    const depotDistrict = new Map(DEPOTS.map((d) => [d.id, d.districtId]));
    expect(areaRows({ all: true, stateIds: [], depotIds: [], districtIds: [] }, rows, depotDistrict)).toEqual([rows[0]]);
    expect(areaRows({ all: false, stateIds: ["state_ap"], depotIds: [], districtIds: [] }, rows, depotDistrict)).toEqual([rows[0]]);
    expect(areaRows({ all: false, stateIds: [], depotIds: ["dep_knl", "dep_ndl"], districtIds: ["dist_knl"] }, rows, depotDistrict)).toEqual([rows[1]]);
    expect(areaRows({ all: false, stateIds: [], depotIds: ["dep_knl"], districtIds: [] }, rows, depotDistrict)).toEqual([rows[2]]);
  });
});

describe("Day 15: gov counts", () => {
  const trip = (status: string, delayMinutes: number, busId?: string) =>
    ({ id: "t", status, delayMinutes, route: { depotId: "d", depot: { districtId: "x" } }, assignments: busId ? [{ busId }] : [] }) as never;

  it("counts running trips, their buses and trips 5 minutes or more late", () => {
    expect(
      countTrips([trip("RUNNING", 0, "b1"), trip("RUNNING", 7, "b2"), trip("COMPLETED", 5), trip("CANCELLED", 30), trip("SCHEDULED", 4)]),
    ).toEqual({ activeTrips: 2, activeBuses: 2, delayedTrips: 2 });
  });

  it("weights on time by completed trips across rows", () => {
    const totals = sumRows([
      { tripsCompleted: 10, onTimePct: 100, passengers: 5, ticketsSold: 4, revenuePaise: 100n },
      { tripsCompleted: 30, onTimePct: 50, passengers: 5, ticketsSold: 4, revenuePaise: 200n },
    ] as DailyStatsRow[]);
    expect(totals).toEqual({ passengers: 10, tickets: 8, revenuePaise: 300, onTimePct: 62.5 });
  });
});

describe("Day 15: CSV", () => {
  it("quotes commas, quotes and line breaks", () => {
    expect(escapeCsvField("Kurnool, Nandyal")).toBe('"Kurnool, Nandyal"');
    expect(escapeCsvField('He said "late"')).toBe('"He said ""late"""');
    expect(escapeCsvField("line\nbreak")).toBe('"line\nbreak"');
    expect(escapeCsvField(null)).toBe("");
  });

  it("neutralises text that a spreadsheet would run as a formula, but keeps numbers", () => {
    expect(escapeCsvField("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(escapeCsvField("+91 98765")).toBe("'+91 98765");
    expect(escapeCsvField("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(escapeCsvField(-12.5)).toBe("-12.5");
  });

  it("keeps Telugu intact after the BOM, with CRLF lines", () => {
    const csv = formatCsvWithBom([["Route"], ["కర్నూలు నుండి విజయవాడ"]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe("﻿Route\r\nకర్నూలు నుండి విజయవాడ\r\n");
    expect(csvLine([1, "a"])).toBe("1,a\r\n");
    expect(rupees(54100)).toBe("541.00");
  });

  it("limits a depot manager's complaints report to their depot and pages through it", async () => {
    const findMany = vi.fn().mockResolvedValueOnce([
      {
        id: "c1",
        code: "CMP-ABC123",
        createdAt: new Date("2026-10-05T04:30:00.000Z"),
        category: "DELAY",
        status: "RESOLVED",
        depot: { nameEn: "Kurnool depot" },
        routeCode: "KNL-VJA-01",
        busRegNo: "AP 39 Z 0101",
        travelDate: new Date("2026-10-05T00:00:00.000Z"),
        message: "=cmd, late",
        resolutionNote: null,
        resolvedAt: null,
      },
    ]);
    const prisma = { depot: { findMany: depotFinder() }, complaint: { findMany } };
    const analytics = new AnalyticsService(prisma as unknown as PrismaService, {} as RollupsService);
    const reports = new ReportsService(prisma as unknown as PrismaService, analytics);
    const lines: string[] = [];
    for await (const line of reports.lines(manager, "complaints", "2026-10-01", "2026-10-05")) lines.push(line);

    expect(findMany.mock.calls[0]![0].where.depotId).toEqual({ in: ["dep_knl"] });
    expect(lines[0]).toMatch(/^Complaint code,Created \(IST\)/);
    expect(lines[1]).toBe(
      "CMP-ABC123,2026-10-05 10:00,DELAY,RESOLVED,Kurnool depot,KNL-VJA-01,AP 39 Z 0101,2026-10-05,\"'=cmd, late\",,\r\n",
    );
  });
});

describe("Day 17: worst routes", () => {
  it("ranks routes by average delay and finds the 3 hour peak window", () => {
    const out = worstRoutes([
      { routeId: "a", routeCode: "KNL-VJA-01", hour: 8, total: 10, trips: 2 },
      { routeId: "a", routeCode: "KNL-VJA-01", hour: 17, total: 60, trips: 2 },
      { routeId: "a", routeCode: "KNL-VJA-01", hour: 18, total: 60, trips: 2 },
      { routeId: "a", routeCode: "KNL-VJA-01", hour: 19, total: 50, trips: 2 },
      { routeId: "b", routeCode: "VSP-SMC-01", hour: 9, total: 4, trips: 4 },
      { routeId: "c", routeCode: "KNL-NDL-01", hour: 9, total: 0, trips: 4 },
    ]);
    expect(out[0]).toEqual({ routeId: "a", routeCode: "KNL-VJA-01", avgDelayMin: 22.5, peakFromHour: 17, peakToHour: 20 });
    expect(out[1]!.routeCode).toBe("VSP-SMC-01");
    expect(out[2]).toMatchObject({ routeCode: "KNL-NDL-01", avgDelayMin: 0, peakFromHour: null, peakToHour: null });
  });
});
