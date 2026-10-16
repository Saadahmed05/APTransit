import { isSeatless, LOCAL_ROUTE_MAX_KM, SEATLESS_SERVICE_TYPES, SERVICE_BUS_CLASS } from "@aptransit/shared";
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
    for (const name of ["Jyothi Mall", "TGV Anantha City Square Mall", "Skandhanshi Prithvi", "G Pulla Reddy Engineering College", "Kurnool Medical College"]) {
      expect(STOPS.some((s) => s.nameEn === name && s.districtCode === "KNL"), name).toBe(true);
    }
  });

  it("has at least 40 Kurnool spots as stops, all inside Kurnool city", () => {
    const spots = STOPS.filter((s) => s.districtCode === "KNL" && s.lat > 15.77 && s.lat < 15.88 && s.lng > 77.98 && s.lng < 78.1);
    expect(spots.length).toBeGreaterThanOrEqual(40);
  });

  it("puts every Kurnool spot on a city line with a Telugu name and a unique code", () => {
    const cityLines = ROUTE_DEFS.filter((r) => ["KCM-01", "KCC-01", "KHL-01", "KCL-01", "KOT-01", "KSA-01", "KSB-01", "KSC-01", "KSD-01"].includes(r.code));
    const onLine = new Set(cityLines.flatMap((r) => r.stops.map((s) => s.stopCode)));
    const spots = STOPS.filter((s) => s.districtCode === "KNL" && s.lat > 15.77 && s.lat < 15.88 && s.lng > 77.98 && s.lng < 78.1);
    expect(new Set(spots.map((s) => s.code)).size).toBe(spots.length);
    expect(new Set(spots.map((s) => s.nameEn)).size).toBe(spots.length);
    for (const s of spots) expect(s.nameTe, s.code).toMatch(/[ఀ-౿]/);
    expect(spots.filter((s) => !onLine.has(s.code)).map((s) => `${s.code} ${s.nameEn}`)).toEqual([]);
  });

  it("links nearby towns to Kurnool and Nandyal with local buses", () => {
    for (const code of ["ADN", "ATK", "BNP"]) expect(STOPS.some((s) => s.code === code)).toBe(true);
    const adoni = TIMETABLE_DEFS.filter((t) => t.routeCode === "KNL-ADN-01" && t.serviceType === "PALLEVELUGU");
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

  it("minutes rise strictly along every route, so no search shows a negative duration", () => {
    for (const r of ROUTE_DEFS) {
      for (let i = 1; i < r.stops.length; i++) {
        expect(r.stops[i]!.minutesFromOrigin, `${r.code} ${r.stops[i]!.stopCode}`).toBeGreaterThan(r.stops[i - 1]!.minutesFromOrigin);
      }
    }
  });
});

const BUS_CLASS_OF: Record<string, "NORMAL" | "EXPRESS" | "SUPER_LUXURY"> = SERVICE_BUS_CLASS;
const HOURS = Array.from({ length: 19 }, (_, i) => `${String(5 + i).padStart(2, "0")}:00`);
const departuresOf = (routeCode: string) => TIMETABLE_DEFS.filter((t) => t.routeCode === routeCode);
const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

describe("hourly services (D-048)", () => {
  const intercity = ["KNL-VJA-01", "KNL-TPT-01", "KNL-ATP-01", "KNL-NDL-01", "VJA-VSP-01", "KNL-ADN-01", "KNL-ATK-01", "DHN-NDL-01", "GNT-VKD-01"];

  it("runs Express, Ultra Deluxe and Super Luxury class buses every hour, 05:00 to 23:00, both ways", () => {
    for (const code of intercity) {
      const reverse = ROUTE_DEFS.find((r) => r.code === code)!.reverseCode;
      for (const [route, offset] of [[code, 0], [reverse, 30]] as const) {
        for (const hour of HOURS) {
          const at = departuresOf(route).filter((t) => minutesOf(t.departureLocal) === minutesOf(hour) + offset);
          const classes = new Set(at.map((t) => BUS_CLASS_OF[t.serviceType]));
          expect(classes.has("EXPRESS"), `${route} ${hour} express`).toBe(true);
          expect(classes.has("SUPER_LUXURY"), `${route} ${hour} super luxury`).toBe(true);
          expect(at.some((t) => t.serviceType === "ULTRA_DELUXE"), `${route} ${hour} ultra deluxe`).toBe(true);
        }
      }
    }
  });

  it("adds Pallevelugu at least every 30 min on routes up to the local limit, never beyond it", () => {
    for (const code of [...intercity, "VJA-GNT-01"]) {
      const local = departuresOf(code).filter((t) => BUS_CLASS_OF[t.serviceType] === "NORMAL").map((t) => minutesOf(t.departureLocal));
      if (routeKm(code) > LOCAL_ROUTE_MAX_KM) {
        expect(local, code).toEqual([]);
        continue;
      }
      expect(Math.min(...local), code).toBeLessThanOrEqual(minutesOf("05:00"));
      expect(Math.max(...local), code).toBeGreaterThanOrEqual(minutesOf("23:00"));
      const gaps = local.slice(1).map((m, i) => m - local[i]!);
      expect(Math.max(...gaps), code).toBeLessThanOrEqual(30);
    }
  });

  it("runs every Kurnool city line at least every 30 min, 05:00 to 23:00", () => {
    for (const code of ["KCM-01", "KCC-01", "KHL-01", "KCL-01", "KOT-01", "KSA-01", "KSB-01", "KSC-01", "KSD-01"]) {
      const times = departuresOf(code).map((t) => minutesOf(t.departureLocal));
      expect(times[0], code).toBe(minutesOf("05:00"));
      expect(times.at(-1), code).toBeGreaterThanOrEqual(minutesOf("23:00") - 30);
      const gaps = times.slice(1).map((m, i) => m - times[i]!);
      expect(Math.max(...gaps), code).toBeLessThanOrEqual(30);
    }
  });

  it("never lists the same route, time and service twice", () => {
    const keys = TIMETABLE_DEFS.map((t) => `${t.routeCode} ${t.departureLocal} ${t.serviceType}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
