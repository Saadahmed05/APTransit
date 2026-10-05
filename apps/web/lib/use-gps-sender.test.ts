import { describe, expect, it } from "vitest";
import { gpsStatus, toPoint } from "./use-gps-sender";

const now = 1_800_000_000_000;

describe("gpsStatus (docs/13 thresholds)", () => {
  it("Active: a fix under 30 s old with accuracy under 50 m", () => {
    expect(gpsStatus({ at: now - 10_000, accuracyM: 12 }, false, now)).toBe("ACTIVE");
  });

  it("Weak: accuracy over 50 m, or a fix 30 to 90 s old", () => {
    expect(gpsStatus({ at: now - 5_000, accuracyM: 80 }, false, now)).toBe("WEAK");
    expect(gpsStatus({ at: now - 45_000, accuracyM: 10 }, false, now)).toBe("WEAK");
  });

  it("Off: no fix, a fix over 90 s old, or permission denied", () => {
    expect(gpsStatus(null, false, now)).toBe("OFF");
    expect(gpsStatus({ at: now - 91_000, accuracyM: 10 }, false, now)).toBe("OFF");
    expect(gpsStatus({ at: now, accuracyM: 5 }, true, now)).toBe("OFF");
  });
});

describe("toPoint", () => {
  const position = (coords: Partial<GeolocationCoordinates>) =>
    ({ timestamp: now, coords: { latitude: 15.6, longitude: 78.3, accuracy: 8.4, speed: null, heading: null, altitude: null, altitudeAccuracy: null, ...coords } }) as GeolocationPosition;

  it("converts m/s to km/h and keeps the device time", () => {
    expect(toPoint(position({ speed: 12.5, heading: 271.6 }))).toEqual({
      lat: 15.6,
      lng: 78.3,
      speedKmh: 45,
      headingDeg: 272,
      accuracyM: 8,
      recordedAt: new Date(now).toISOString(),
    });
  });

  it("leaves out unknown speed and heading", () => {
    const point = toPoint(position({ heading: Number.NaN }));
    expect(point).not.toHaveProperty("speedKmh");
    expect(point).not.toHaveProperty("headingDeg");
  });
});
