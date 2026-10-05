import { encodePolyline } from "@aptransit/shared";
import { describe, expect, it } from "vitest";
import { buildRouteGeometry, currentStop, delayMinutesAt, etaSecondsTo, haversineKm, nextStop, progressPct, type RouteStopRef, snapToRoute } from "./progress";

// The seeded KNL-VJA-01 route (prisma/seed-data.ts): straight lines between its stops.
const STOPS: RouteStopRef[] = [
  { stopId: "KNL", seq: 1, kmFromOrigin: 0, minutesFromOrigin: 0, lat: 15.8281, lng: 78.0373 },
  { stopId: "NDL", seq: 2, kmFromOrigin: 70, minutesFromOrigin: 75, lat: 15.4786, lng: 78.4836 },
  { stopId: "GDL", seq: 3, kmFromOrigin: 130, minutesFromOrigin: 145, lat: 15.3789, lng: 78.9265 },
  { stopId: "MKP", seq: 4, kmFromOrigin: 190, minutesFromOrigin: 205, lat: 15.7353, lng: 79.2698 },
  { stopId: "VKD", seq: 5, kmFromOrigin: 245, minutesFromOrigin: 260, lat: 16.0529, lng: 79.7394 },
  { stopId: "NRT", seq: 6, kmFromOrigin: 285, minutesFromOrigin: 290, lat: 16.235, lng: 80.048 },
  { stopId: "GNT", seq: 7, kmFromOrigin: 330, minutesFromOrigin: 320, lat: 16.3067, lng: 80.4365 },
  { stopId: "VJA", seq: 8, kmFromOrigin: 365, minutesFromOrigin: 340, lat: 16.5097, lng: 80.6197 },
];
const POLYLINE = encodePolyline(STOPS.map((s) => [s.lat, s.lng]));
const route = buildRouteGeometry(POLYLINE, 365, STOPS);
const lerp = (a: RouteStopRef, b: RouteStopRef, t: number): [number, number] => [a.lat + (b.lat - a.lat) * t, a.lng + (b.lng - a.lng) * t];

describe("progress (seeded KNL-VJA polyline)", () => {
  it("anchors road km to the stops", () => {
    expect(route.kmAtVertex).toEqual([0, 70, 130, 190, 245, 285, 330, 365]);
  });

  it("snaps a stop to its road km", () => {
    for (const stop of STOPS) {
      const snap = snapToRoute([stop.lat, stop.lng], route);
      expect(snap.kmAlong).toBeCloseTo(stop.kmFromOrigin, 0);
      expect(snap.offRouteM).toBeLessThan(5);
    }
  });

  it("interpolates between stops and reports progress", () => {
    const snap = snapToRoute(lerp(STOPS[1]!, STOPS[2]!, 0.5), route);
    expect(snap.kmAlong).toBeCloseTo(100, 0);
    expect(snap.progressPct).toBeCloseTo(27.4, 1);
  });

  it("measures a point off the road", () => {
    const [lat, lng] = lerp(STOPS[0]!, STOPS[1]!, 0.5);
    const snap = snapToRoute([lat + 0.01, lng + 0.01], route);
    expect(snap.kmAlong).toBeGreaterThan(25);
    expect(snap.kmAlong).toBeLessThan(45);
    expect(snap.offRouteM).toBeGreaterThan(500);
    expect(snap.offRouteM).toBeLessThan(2_000);
  });

  it("clamps before the origin and after the end", () => {
    expect(snapToRoute([16.0, 77.8], route).kmAlong).toBe(0);
    expect(snapToRoute([16.7, 80.8], route).kmAlong).toBe(365);
    expect(progressPct(400, 365)).toBe(100);
    expect(progressPct(-1, 365)).toBe(0);
  });

  it("current and next stop, with the 150 m and 0.2 km rules", () => {
    expect(currentStop(STOPS, 0)?.stopId).toBe("KNL");
    expect(nextStop(STOPS, 0)?.stopId).toBe("NDL");
    expect(currentStop(STOPS, 69.85)?.stopId).toBe("NDL");
    expect(nextStop(STOPS, 69.9)?.stopId).toBe("GDL");
    expect(nextStop(STOPS, 69.8)?.stopId).toBe("NDL");
    expect(nextStop(STOPS, 365)).toBeNull();
  });

  it("proportional km when the polyline has its own vertices", () => {
    const geometry = buildRouteGeometry([[15.8281, 78.0373], [15.6, 78.3], [15.4786, 78.4836]], 70);
    expect(geometry.kmAtVertex[0]).toBe(0);
    expect(geometry.kmAtVertex.at(-1)).toBeCloseTo(70, 5);
  });

  it("haversine is about 62 km from Kurnool to Nandyal in a straight line", () => {
    expect(haversineKm([15.8281, 78.0373], [15.4786, 78.4836])).toBeCloseTo(61.6, 1);
  });
});

describe("delay and ETA (pace factor 1)", () => {
  const departure = new Date("2026-10-05T00:30:00.000Z"); // 06:00 IST
  it("delay is whole minutes after the scheduled time at the last reached stop, never negative", () => {
    expect(delayMinutesAt(departure, STOPS[1]!, new Date(departure.getTime() + 87.5 * 60_000))).toBe(12);
    expect(delayMinutesAt(departure, STOPS[1]!, new Date(departure.getTime() + 60 * 60_000))).toBe(0);
    expect(delayMinutesAt(departure, null, new Date())).toBe(0);
  });

  it("ETA is the scheduled run time from the last reached stop", () => {
    expect(etaSecondsTo(STOPS[2]!, STOPS[1]!, departure, new Date())).toBe(70 * 60);
    expect(etaSecondsTo(STOPS[1]!, null, departure, new Date(departure.getTime() - 10 * 60_000))).toBe(85 * 60);
  });
});
