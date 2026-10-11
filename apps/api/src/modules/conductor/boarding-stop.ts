import type { StopSource } from "@aptransit/shared";
import type { GpsBox } from "../tracking/tracking.service";
import { haversineKm } from "../tracking/progress";

// D-035: where a passenger boarded. Pure function, table tested in boarding-stop.test.ts.

/** A bus position older than this is not trusted for the boarding stop. */
export const BUS_GPS_FRESH_MS = 60_000;
/** A scan belongs to a stop only within this distance of it. */
export const STOP_RADIUS_KM = 0.4;

export interface BoardingStopRef {
  stopId: string;
  seq: number;
  lat: number;
  lng: number;
}

/** The parts of bus:live:{tripId} the rule needs. */
export interface LiveBusPoint {
  lat: number;
  lng: number;
  recordedAt: string;
  nextStopSeq: number | null;
}

export interface DevicePoint {
  lat: number;
  lng: number;
}

export interface ResolvedBoardingStop {
  stopId: string | null;
  seq: number | null;
  source: StopSource;
  /** The position the stop came from (or the best one known when no stop matched). */
  lat: number | null;
  lng: number | null;
}

const inBox = (p: DevicePoint, box: GpsBox) =>
  p.lat >= box.minLat && p.lat <= box.maxLat && p.lng >= box.minLng && p.lng <= box.maxLng;

/** The nearest stop within STOP_RADIUS_KM whose seq is not past the next stop. */
function nearestStop(stops: readonly BoardingStopRef[], point: DevicePoint, maxSeq: number): BoardingStopRef | null {
  let best: BoardingStopRef | null = null;
  let bestKm = Infinity;
  for (const stop of stops) {
    if (stop.seq > maxSeq) continue;
    const km = haversineKm([point.lat, point.lng], [stop.lat, stop.lng]);
    if (km <= STOP_RADIUS_KM && km < bestKm) {
      best = stop;
      bestKm = km;
    }
  }
  return best;
}

/**
 * 1. Bus GPS newer than 60 s: the nearest route stop within 400 m with seq up to the next stop. BUS_GPS.
 * 2. Else the scanning device's position, when it is inside the state box: the same rule. DEVICE_GPS.
 * 3. Else NONE, and every stop check is skipped (bad GPS must never strand a passenger).
 * `lastStopSeq` (the trip record) bounds the device rule when the live next stop is not fresh.
 */
export function resolveBoardingStop(
  routeStops: readonly BoardingStopRef[],
  live: LiveBusPoint | null,
  device: DevicePoint | null,
  now: Date,
  options: { box?: GpsBox; lastStopSeq?: number | null } = {},
): ResolvedBoardingStop {
  const fresh = live !== null && now.getTime() - Date.parse(live.recordedAt) <= BUS_GPS_FRESH_MS ? live : null;
  const maxSeq = fresh?.nextStopSeq ?? (typeof options.lastStopSeq === "number" ? options.lastStopSeq + 1 : Infinity);

  if (fresh) {
    const stop = nearestStop(routeStops, fresh, maxSeq);
    if (stop) return { stopId: stop.stopId, seq: stop.seq, source: "BUS_GPS", lat: fresh.lat, lng: fresh.lng };
  }
  const usableDevice = device && (!options.box || inBox(device, options.box)) ? device : null;
  if (usableDevice) {
    const stop = nearestStop(routeStops, usableDevice, maxSeq);
    if (stop) return { stopId: stop.stopId, seq: stop.seq, source: "DEVICE_GPS", lat: usableDevice.lat, lng: usableDevice.lng };
  }
  const point = fresh ?? usableDevice;
  return { stopId: null, seq: null, source: "NONE", lat: point?.lat ?? null, lng: point?.lng ?? null };
}
