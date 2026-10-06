import { describe, expect, it } from "vitest";
import {
  delayMinutesAt,
  delayNotificationBand,
  etaSecondsTo,
  paceFactor,
  reachedStop,
} from "./progress";
const departure = new Date("2026-10-05T04:30:00Z");
const minutes = (n: number) => new Date(departure.getTime() + n * 60_000);
const stops = [
  { stopId: "a", seq: 1, kmFromOrigin: 0, minutesFromOrigin: 0, lat: 15, lng: 78 },
  { stopId: "b", seq: 2, kmFromOrigin: 10, minutesFromOrigin: 10, lat: 15.1, lng: 78 },
];
describe("Day 12 fixed tracking math", () => {
  it("requires physical proximity within 150 m, with a persistent last reached stop", () => {
    expect(reachedStop(stops, [15.1, 78], 10, null)?.seq).toBe(2);
    expect(reachedStop(stops, [15.0987, 78], 9.87, null)?.seq).toBe(2);
    expect(reachedStop(stops, [15.0986, 78], 9.86, null)).toBeNull();
    expect(reachedStop(stops, [15.05, 78], 5, 1)?.seq).toBe(1);
    expect(reachedStop(stops, [15, 78], 0, 2)?.seq).toBe(2);
  });
  it("floors delay at zero and uses whole minutes against the reached stop", () => {
    expect(delayMinutesAt(departure, stops[1]!, minutes(9))).toBe(0);
    expect(delayMinutesAt(departure, stops[1]!, minutes(25.9))).toBe(15);
    expect(delayMinutesAt(departure, null, minutes(25))).toBe(0);
  });
  it("clamps early and stalled pace and keeps pace 1 before the first stop", () => {
    expect(paceFactor(null, departure, minutes(30))).toBe(1);
    expect(paceFactor(stops[0]!, departure, minutes(30))).toBe(1);
    expect(paceFactor(stops[1]!, null, minutes(30))).toBe(1);
    expect(paceFactor(stops[1]!, departure, minutes(5))).toBe(0.8);
    expect(paceFactor(stops[1]!, departure, minutes(12))).toBe(1.2);
    expect(paceFactor(stops[1]!, departure, minutes(30))).toBe(1.5);
  });
  it("applies pace to every upcoming stop", () => {
    expect(
      etaSecondsTo({ minutesFromOrigin: 20 }, stops[1]!, departure, minutes(12), departure),
    ).toBe(720);
    expect(
      etaSecondsTo({ minutesFromOrigin: 20 }, stops[1]!, departure, minutes(30), departure),
    ).toBe(900);
    expect(etaSecondsTo(stops[1]!, null, departure, minutes(-5))).toBe(900);
  });
  it("notifies at 10 then each further 15 minutes", () => {
    expect([9, 10, 24, 25, 39, 40].map(delayNotificationBand)).toEqual([null, 10, 10, 25, 25, 40]);
  });
});
