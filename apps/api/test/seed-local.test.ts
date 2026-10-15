import { isSeatless, LOCAL_ROUTE_MAX_KM, SEATLESS_SERVICE_TYPES } from "@aptransit/shared";
import { describe, expect, it } from "vitest";
import { ROUTE_DEFS, STOPS, TIMETABLE_DEFS } from "../prisma/seed-data";

const routeKm = (code: string) =>
  Math.max(
    ...ROUTE_DEFS.filter((r) => r.code === code || r.reverseCode === code).flatMap((r) =>
      r.stops.map((s) => s.kmFromOrigin),
    ),
  );

describe("local services in the seed (D-046)", () => {
  it("never runs a local service on a route longer than the local limit", () => {
    for (const t of TIMETABLE_DEFS) {
      if (SEATLESS_SERVICE_TYPES.includes(t.serviceType)) {
        expect(routeKm(t.routeCode), t.routeCode).toBeLessThanOrEqual(LOCAL_ROUTE_MAX_KM);
      }
    }
  });

  it("has Kurnool malls and colleges as stops with distinct codes", () => {
    const codes = STOPS.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const name of ["Jyothi Mall", "G Pulla Reddy Engineering College", "Kurnool Medical College"]) {
      expect(STOPS.some((s) => s.nameEn === name && s.districtCode === "KNL"), name).toBe(true);
    }
  });

  it("links nearby towns to Kurnool and Nandyal with local buses", () => {
    for (const code of ["ADN", "ATK", "BNP"]) expect(STOPS.some((s) => s.code === code)).toBe(true);
    const adoni = TIMETABLE_DEFS.filter((t) => t.routeCode === "KNL-ADN-01");
    expect(adoni.length).toBeGreaterThan(0);
    expect(adoni.every((t) => isSeatless(t.serviceType, 90))).toBe(true);
  });

  it("every route stop exists and kms rise along the route", () => {
    const stops = new Set(STOPS.map((s) => s.code));
    for (const r of ROUTE_DEFS) {
      let last = -1;
      for (const s of r.stops) {
        expect(stops.has(s.stopCode), `${r.code} ${s.stopCode}`).toBe(true);
        expect(s.kmFromOrigin).toBeGreaterThanOrEqual(last);
        last = s.kmFromOrigin;
      }
    }
  });
});
