/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { OpsService } from "../src/modules/ops/ops.service";

// v3 Phase 4, D-042 and D-035: passengers per stage on the ops trip page.

const stop = (seq: number, id: string) => ({ stopId: id, seq, stop: { nameEn: `Stop ${id}`, nameTe: `Stop ${id} te` } });
const TRIP = {
  id: "tripstages00001",
  code: "TRP-S",
  status: "RUNNING",
  routeId: "routestages0001",
  serviceDate: new Date("2026-10-15T00:00:00Z"),
  scheduledDepartureAt: new Date("2026-10-15T04:00:00Z"),
  scheduledArrivalAt: new Date("2026-10-15T08:00:00Z"),
  actualDepartureAt: null,
  actualArrivalAt: null,
  delayMinutes: 0,
  hasOpenIncident: false,
  route: { nameEn: "R", nameTe: "R te", depotId: "depot1" },
  tickets: [],
  assignments: [],
  incidents: [],
};

function service(scans: { stopId: string | null; result: string }[]) {
  const prisma = {
    // The database orders by seq (the query asks for it)
    routeStop: { findMany: async () => [stop(1, "A"), stop(2, "B"), stop(3, "C")].sort(() => 0) },
    ticket: {
      findMany: async () => [
        { boardingStopId: "A", droppingStopId: "C", status: "ACTIVE" },
        { boardingStopId: "A", droppingStopId: "B", status: "BOOKED" },
        { boardingStopId: "B", droppingStopId: "C", status: "ACTIVE" },
      ],
    },
    ticketScan: {
      groupBy: async ({ where }: any) => {
        const valid = scans.filter((s) => s.result === where.result);
        const counts = new Map<string | null, number>();
        for (const s of valid) counts.set(s.stopId, (counts.get(s.stopId) ?? 0) + 1);
        return [...counts].map(([stopId, n]) => ({ stopId, _count: { _all: n } }));
      },
    },
  };
  const ops = new OpsService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  vi.spyOn(ops as any, "trip").mockResolvedValue(TRIP);
  return ops;
}

describe("OpsService.tripProfile stages", () => {
  it("returns one row per route stop in seq order with booked, boarded and alighting", async () => {
    const ops = service([
      { stopId: "A", result: "VALID" },
      { stopId: "A", result: "VALID" },
      { stopId: "B", result: "VALID" },
    ]);
    const profile = await ops.tripProfile({} as any, TRIP.id);
    expect(profile.stages.map((s: any) => s.seq)).toEqual([1, 2, 3]);
    expect(profile.stages.map((s: any) => [s.stopId, s.booked, s.boarded, s.alighting])).toEqual([
      ["A", 2, 2, 0],
      ["B", 1, 1, 1],
      ["C", 0, 0, 2],
    ]);
  });

  it("counts VALID scans with no stop as pass boardings and ignores INVALID scans", async () => {
    const ops = service([
      { stopId: null, result: "VALID" },
      { stopId: null, result: "VALID" },
      { stopId: "A", result: "INVALID" },
      { stopId: null, result: "INVALID" },
    ]);
    const profile = await ops.tripProfile({} as any, TRIP.id);
    expect(profile.passBoardings).toBe(2);
    expect(profile.stages.every((s: any) => s.boarded === 0)).toBe(true);
  });
});
