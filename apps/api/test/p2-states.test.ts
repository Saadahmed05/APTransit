import { describe, expect, it, vi } from "vitest";
import { AP_STATE, TG_STATE } from "../prisma/seed-data";
import type { AuthenticatedUser } from "../src/common/auth/auth.types";
import { AnalyticsService } from "../src/modules/analytics/analytics.service";
import { areaRows, GovService } from "../src/modules/gov/gov.service";
import { buildDailyStats, type RollupsService, type TripFact } from "../src/modules/rollups/rollups.service";
import { checkPoint, gpsBoxOf, type TrackingService } from "../src/modules/tracking/tracking.service";
import type { PrismaService } from "../src/prisma/prisma.service";

// P2 (D-034): State > District > Depot > Route > Bus > Trip. AP is a data row; a second state
// works with no code change. Two states throughout: AP (Kurnool) and TG (Hyderabad).

const AP = "state_ap";
const TG = "state_tg";
const DEPOTS = [
  { id: "dep_knl", districtId: "dist_knl", stateId: AP },
  { id: "dep_hyd", districtId: "dist_hyd", stateId: TG },
];
const apAdmin: AuthenticatedUser = { id: "ap", roles: [{ role: "STATE_ADMIN", stateId: AP }] };
const tgOfficer: AuthenticatedUser = { id: "tg", roles: [{ role: "TRANSPORT_OFFICER", stateId: TG }] };
const root: AuthenticatedUser = { id: "root", roles: [{ role: "SUPER_ADMIN" }] };

/** Evaluates the depot where clauses depotScopeWhere and narrowToState build. */
const depotFinder = vi.fn(async (args?: { where?: Record<string, unknown> }) => {
  const where = (args?.where ?? {}) as {
    OR?: Array<{ district?: { stateId: string } }>;
    district?: { stateId: string };
  };
  return DEPOTS.filter((d) => {
    if (where.district) return d.stateId === where.district.stateId;
    if (where.OR) return where.OR.some((o) => o.district?.stateId === d.stateId);
    return true;
  });
});
const prisma = { depot: { findMany: depotFinder } } as unknown as PrismaService;

const boxOf = (s: typeof AP_STATE) => {
  const [minLng, minLat, maxLng, maxLat] = s.bounds;
  return gpsBoxOf({ minLat, minLng, maxLat, maxLng });
};
const at = (lat: number, lng: number) => ({ lat, lng, speedKmh: 40, recordedAt: new Date().toISOString() });

describe("P2: GPS trust box per state", () => {
  const now = new Date();
  const ap = boxOf(AP_STATE);
  const tg = boxOf(TG_STATE);

  it("accepts a Hyderabad point for a TG trip", () => {
    expect(checkPoint(at(17.3786, 78.4833), now, tg)).toBeNull();
  });

  it("accepts AP points outside Telangana for an AP trip and rejects them for a TG trip", () => {
    // Visakhapatnam (east of TG) and Tirupati (south of TG)
    for (const [lat, lng] of [[17.724, 83.305], [13.6288, 79.4192]] as const) {
      expect(checkPoint(at(lat, lng), now, ap)).toBeNull();
      expect(checkPoint(at(lat, lng), now, tg)).toBe("OUT_OF_BOUNDS");
    }
  });

  it("keeps AP's old box exactly (bounds plus about 50 km)", () => {
    expect(ap).toEqual({ minLng: 76.2, minLat: 12.15, maxLng: 85.3, maxLat: 20.4 });
    expect(checkPoint(at(28.6, 77.2), now, ap)).toBe("OUT_OF_BOUNDS");
  });
});

const fact = (over: Partial<TripFact>): TripFact => ({
  routeId: "rt_knl",
  routeCode: "KNL-VJA-01",
  depotId: "dep_knl",
  districtId: "dist_knl",
  stateId: AP,
  status: "COMPLETED",
  delayMinutes: 0,
  tickets: 10,
  passScans: 0,
  capturedPaise: 1_000n,
  refundedPaise: 0n,
  incidents: 0,
  ...over,
});

describe("P2: rollups with two states", () => {
  const rows = buildDailyStats(
    new Date("2026-10-08T00:00:00.000Z"),
    [fact({}), fact({ routeId: "rt_hyd", routeCode: "HYD-WGL-01", depotId: "dep_hyd", districtId: "dist_hyd", stateId: TG, tickets: 4 })],
    {
      complaints: [
        { depotId: "dep_knl", routeCode: null },
        { depotId: "dep_hyd", routeCode: null },
        { depotId: null, routeCode: null },
      ],
      depotDistrict: new Map(DEPOTS.map((d) => [d.id, d.districtId])),
      districtState: new Map(DEPOTS.map((d) => [d.districtId, d.stateId])),
      stateIds: [AP, TG, "state_new"],
      passesActive: new Map<string | null, number>([[AP, 7], [TG, 2], [null, 1]]),
    },
  );
  const stateRow = (id: string) => rows.find((r) => r.stateId === id && !r.districtId && !r.depotId && !r.routeId)!;

  it("writes one state row per state, each with only its own trips", () => {
    expect(stateRow(AP)).toMatchObject({ ticketsSold: 10, tripsScheduled: 1 });
    expect(stateRow(TG)).toMatchObject({ ticketsSold: 4, tripsScheduled: 1 });
  });

  it("gives a state without trips that day a zero row", () => {
    expect(stateRow("state_new")).toMatchObject({ ticketsSold: 0, tripsScheduled: 0, passesActive: 1 });
  });

  it("puts the stateId on every row", () => {
    expect(rows.every((r) => r.stateId)).toBe(true);
    expect(rows.find((r) => r.routeId === "rt_hyd")!.stateId).toBe(TG);
  });

  it("counts passes and complaints per state; placeless ones in every state", () => {
    expect(stateRow(AP)).toMatchObject({ passesActive: 8, complaints: 2 });
    expect(stateRow(TG)).toMatchObject({ passesActive: 3, complaints: 2 });
  });

  it("lets each state role see only its own state row; the super admin every state row", () => {
    const depotDistrict = new Map(DEPOTS.map((d) => [d.id, d.districtId]));
    const ap = areaRows({ all: false, stateIds: [AP], depotIds: ["dep_knl"], districtIds: ["dist_knl"] }, rows, depotDistrict);
    expect(ap).toEqual([stateRow(AP)]);
    const all = areaRows({ all: true, stateIds: [], depotIds: [], districtIds: [] }, rows, depotDistrict);
    expect(all.map((r) => r.stateId).sort()).toEqual([AP, "state_new", TG].sort());
  });
});

describe("P2: analytics and gov scope across two states", () => {
  const analytics = new AnalyticsService(prisma, {} as RollupsService);

  it("scopes a state role to the depots of its state", async () => {
    await expect(analytics.scopeFor(apAdmin)).resolves.toEqual({ all: false, stateIds: [AP], depotIds: ["dep_knl"], districtIds: ["dist_knl"] });
    await expect(analytics.scopeFor(tgOfficer)).resolves.toEqual({ all: false, stateIds: [TG], depotIds: ["dep_hyd"], districtIds: ["dist_hyd"] });
  });

  it("narrows the super admin to the picked state", async () => {
    const scope = await analytics.narrowToState(await analytics.scopeFor(root), TG);
    expect(scope).toEqual({ all: false, stateIds: [TG], depotIds: ["dep_hyd"], districtIds: ["dist_hyd"] });
  });

  it("refuses another state's overview and map", async () => {
    const gov = new GovService(prisma, analytics, {} as TrackingService);
    await expect(gov.overview(apAdmin, undefined, TG)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(gov.map(tgOfficer, AP)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
