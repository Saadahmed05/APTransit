import { describe, expect, it } from "vitest";
import { groupFare, passengerCategory, splitGroupTotal } from "./fare";
import { isSeatless, SEATLESS_MAX_KM, segmentKm } from "./seatless";

describe("isSeatless", () => {
  it("is always true for local services", () => {
    for (const s of ["PALLEVELUGU", "ULTRA_PALLEVELUGU", "CITY_ORDINARY"] as const) {
      expect(isSeatless(s, 300)).toBe(true);
    }
  });
  it("is true up to the distance limit on any service", () => {
    expect(isSeatless("EXPRESS", SEATLESS_MAX_KM)).toBe(true);
    expect(isSeatless("EXPRESS", SEATLESS_MAX_KM + 1)).toBe(false);
    expect(isSeatless("GARUDA_AC", 20)).toBe(true);
  });
});

describe("senior fares", () => {
  it("puts 60 and over in the senior category", () => {
    expect(passengerCategory(59)).toBe("ADULT");
    expect(passengerCategory(60)).toBe("SENIOR");
    expect(passengerCategory(11)).toBe("CHILD");
  });
  it("prices adults, children and seniors apart", () => {
    const g = groupFare(10_000, [30, 8, 65]);
    expect(g).toMatchObject({ adults: 1, children: 1, seniors: 1 });
    expect(g.perPassengerPaise).toEqual([10_000, 5_000, 5_000]);
    expect(g.totalPaise).toBe(20_000);
  });
  it("splits a paid total so the parts add up", () => {
    const parts = splitGroupTotal(20_001, [30, 8, 65]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(20_001);
  });
});

describe("segmentKm", () => {
  const stops = [
    { stopId: "a", kmFromOrigin: 0 },
    { stopId: "b", kmFromOrigin: 12.5 },
  ];
  it("gives the distance between two stops", () => expect(segmentKm(stops, "a", "b")).toBe(12.5));
  it("is infinity for an unknown stop or no stops", () => {
    expect(segmentKm(stops, "a", "zz")).toBe(Number.POSITIVE_INFINITY);
    expect(segmentKm(undefined, "a", "b")).toBe(Number.POSITIVE_INFINITY);
  });
});
