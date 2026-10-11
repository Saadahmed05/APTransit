import { describe, expect, it } from "vitest";
import { gpsBoxOf } from "../tracking/tracking.service";
import { BUS_GPS_FRESH_MS, resolveBoardingStop } from "./boarding-stop";

// D-035 boarding stop rule. Kurnool (1), Orvakal (2), Nandyal (3), Allagadda (4).
const STOPS = [
  { stopId: "stopknl", seq: 1, lat: 15.8281, lng: 78.0373 },
  { stopId: "stoporv", seq: 2, lat: 15.67, lng: 78.11 },
  { stopId: "stopndl", seq: 3, lat: 15.4786, lng: 78.4836 },
  { stopId: "stopagd", seq: 4, lat: 15.131, lng: 78.513 },
];
const now = new Date("2026-10-09T05:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const atNandyal = { lat: 15.4786, lng: 78.4836 };
const AP_BOX = gpsBoxOf({ minLng: 76.7, minLat: 12.6, maxLng: 84.8, maxLat: 19.95 });

describe("resolveBoardingStop", () => {
  it("uses fresh bus GPS: the nearest stop within 400 m", () => {
    const live = { ...atNandyal, recordedAt: ago(10_000), nextStopSeq: 4 };
    expect(resolveBoardingStop(STOPS, live, null, now)).toEqual({ stopId: "stopndl", seq: 3, source: "BUS_GPS", ...atNandyal });
  });

  it("ignores bus GPS older than 60 s and falls back to the device", () => {
    const stale = { ...atNandyal, recordedAt: ago(BUS_GPS_FRESH_MS + 1), nextStopSeq: 4 };
    const device = { lat: 15.67, lng: 78.11 };
    expect(resolveBoardingStop(STOPS, stale, device, now)).toMatchObject({ stopId: "stoporv", seq: 2, source: "DEVICE_GPS" });
  });

  it("uses the device position when there is no bus GPS at all", () => {
    expect(resolveBoardingStop(STOPS, null, atNandyal, now, { box: AP_BOX })).toMatchObject({ stopId: "stopndl", source: "DEVICE_GPS" });
  });

  it("returns NONE without any position, so the stop checks are skipped", () => {
    expect(resolveBoardingStop(STOPS, null, null, now)).toEqual({ stopId: null, seq: null, source: "NONE", lat: null, lng: null });
  });

  it("refuses a device position outside the state box", () => {
    const delhi = { lat: 28.6, lng: 77.2 };
    expect(resolveBoardingStop(STOPS, null, delhi, now, { box: AP_BOX })).toMatchObject({ stopId: null, source: "NONE" });
  });

  it("never picks a stop beyond the next stop (a stop just passed counts, one ahead does not)", () => {
    // Bus near Nandyal but its next stop is Orvakal (seq 2): Nandyal (seq 3) is not allowed yet
    const live = { ...atNandyal, recordedAt: ago(5_000), nextStopSeq: 2 };
    expect(resolveBoardingStop(STOPS, live, null, now)).toMatchObject({ stopId: null, source: "NONE", lat: atNandyal.lat });
    // Just left Nandyal, next stop Allagadda: Nandyal is behind and still matches
    const left = { lat: 15.4786 - 0.002, lng: 78.4836, recordedAt: ago(5_000), nextStopSeq: 4 };
    expect(resolveBoardingStop(STOPS, left, null, now)).toMatchObject({ stopId: "stopndl", seq: 3 });
  });

  it("matches within 400 m and not beyond", () => {
    const live = (dLat: number) => ({ lat: 15.4786 + dLat, lng: 78.4836, recordedAt: ago(1_000), nextStopSeq: 4 });
    expect(resolveBoardingStop(STOPS, live(0.0035), null, now).stopId).toBe("stopndl"); // about 389 m
    expect(resolveBoardingStop(STOPS, live(0.0037), null, now).stopId).toBeNull(); // about 411 m
  });

  it("bounds the device rule by the trip's last stop when the bus GPS is stale", () => {
    expect(resolveBoardingStop(STOPS, null, atNandyal, now, { lastStopSeq: 1 })).toMatchObject({ stopId: null, source: "NONE" });
    expect(resolveBoardingStop(STOPS, null, atNandyal, now, { lastStopSeq: 2 })).toMatchObject({ stopId: "stopndl", source: "DEVICE_GPS" });
  });

  it("prefers the bus over the device when both are fresh", () => {
    const live = { ...atNandyal, recordedAt: ago(1_000), nextStopSeq: 4 };
    expect(resolveBoardingStop(STOPS, live, { lat: 15.67, lng: 78.11 }, now).source).toBe("BUS_GPS");
  });
});
