import { type Coordinate, decodePolyline } from "@aptransit/shared";

// docs/13 "Progress, ETA and delay (fixed math, no AI)". Pure functions, unit tested.
// Snap, stop proximity, pace, ETA, delay and notification bands.

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great circle distance in km. */
export function haversineKm(a: Coordinate, b: Coordinate): number {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface RouteStopRef {
  stopId: string;
  seq: number;
  kmFromOrigin: number;
  minutesFromOrigin: number;
  lat: number;
  lng: number;
}

export interface RouteGeometry {
  coords: Coordinate[];
  /** Road km at each vertex. */
  kmAtVertex: number[];
  distanceKm: number;
}

/**
 * Road km at each polyline vertex. The polyline is drawn in straight lines while route_stops carry
 * road km, so geometric length is scaled: by the stop between two vertices when every vertex is a
 * stop (the seeded routes), else proportionally over the whole route.
 */
export function buildRouteGeometry(
  polyline: string | Coordinate[],
  distanceKm: number,
  stops: readonly RouteStopRef[] = [],
): RouteGeometry {
  const coords = typeof polyline === "string" ? decodePolyline(polyline) : polyline;
  const geometric = [0];
  for (let i = 1; i < coords.length; i++)
    geometric.push(geometric[i - 1]! + haversineKm(coords[i - 1]!, coords[i]!));
  const sorted = [...stops].sort((a, b) => a.seq - b.seq);
  const anchored =
    sorted.length === coords.length &&
    sorted.every((stop, i) => haversineKm([stop.lat, stop.lng], coords[i]!) < 0.5);
  const total = geometric.at(-1) ?? 0;
  const kmAtVertex = anchored
    ? sorted.map((s) => s.kmFromOrigin)
    : geometric.map((g) => (total > 0 ? (g / total) * distanceKm : 0));
  return { coords, kmAtVertex, distanceKm };
}

export interface Snap {
  /** Road km from the origin. */
  kmAlong: number;
  /** How far the point is from the route line, in metres. */
  offRouteM: number;
  progressPct: number;
}

/** Project a point onto the nearest polyline segment (local flat projection, fine for road scale). */
export function snapToRoute(point: Coordinate, route: RouteGeometry): Snap {
  if (route.coords.length === 0) return { kmAlong: 0, offRouteM: 0, progressPct: 0 };
  if (route.coords.length === 1) {
    return { kmAlong: 0, offRouteM: haversineKm(point, route.coords[0]!) * 1000, progressPct: 0 };
  }
  let best: Snap = { kmAlong: 0, offRouteM: Number.POSITIVE_INFINITY, progressPct: 0 };
  const cosLat = Math.cos(toRad(point[0]));
  for (let i = 1; i < route.coords.length; i++) {
    const a = route.coords[i - 1]!;
    const b = route.coords[i]!;
    // x is east, y is north, in degrees scaled for latitude
    const ax = a[1] * cosLat;
    const ay = a[0];
    const bx = b[1] * cosLat;
    const by = b[0];
    const px = point[1] * cosLat;
    const py = point[0];
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    const t =
      lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
    const projected: Coordinate = [ay + t * dy, (ax + t * dx) / cosLat];
    const offRouteM = haversineKm(point, projected) * 1000;
    if (offRouteM < best.offRouteM) {
      const km0 = route.kmAtVertex[i - 1]!;
      const km1 = route.kmAtVertex[i]!;
      const kmAlong = km0 + t * (km1 - km0);
      best = { kmAlong, offRouteM, progressPct: progressPct(kmAlong, route.distanceKm) };
    }
  }
  return best;
}

export function progressPct(kmAlong: number, distanceKm: number): number {
  if (distanceKm <= 0) return 0;
  return Math.round(Math.max(0, Math.min(1, kmAlong / distanceKm)) * 1000) / 10;
}

/** docs/13: a stop counts as reached within 150 m; "current" uses kmFromOrigin <= kmAlong + 0.2. */
export const STOP_REACHED_KM = 0.15;
export const CURRENT_STOP_SLACK_KM = 0.2;

/** The last stop passed (or being served), or null before the origin. */
export function currentStop<T extends Pick<RouteStopRef, "kmFromOrigin" | "seq">>(
  stops: readonly T[],
  kmAlong: number,
): T | null {
  const sorted = [...stops].sort((a, b) => a.seq - b.seq);
  let current: T | null = null;
  for (const stop of sorted)
    if (stop.kmFromOrigin <= kmAlong + CURRENT_STOP_SLACK_KM) current = stop;
  return current;
}

/** The first stop still ahead (more than 150 m away along the road), or null at the end. */
export function nextStop<T extends Pick<RouteStopRef, "kmFromOrigin" | "seq">>(
  stops: readonly T[],
  kmAlong: number,
): T | null {
  const sorted = [...stops].sort((a, b) => a.seq - b.seq);
  return sorted.find((stop) => stop.kmFromOrigin > kmAlong + STOP_REACHED_KM) ?? null;
}

/**
 * Delay at the last reached stop, whole minutes, never below 0 (docs/13 step 4).
 * scheduled time at a stop = scheduledDepartureAt + minutesFromOrigin.
 */
export function delayMinutesAt(
  scheduledDepartureAt: Date,
  lastReached: Pick<RouteStopRef, "minutesFromOrigin"> | null,
  now: Date,
): number {
  if (!lastReached) return 0;
  const scheduled = scheduledDepartureAt.getTime() + lastReached.minutesFromOrigin * 60_000;
  return Math.max(0, Math.floor((now.getTime() - scheduled) / 60_000));
}

/**
 * ETA in seconds to a stop with the clamped pace factor (docs/13 step 5):
 * the scheduled minutes between the last reached stop and the target, from now.
 */
export function etaSecondsTo(
  target: Pick<RouteStopRef, "minutesFromOrigin">,
  lastReached: Pick<RouteStopRef, "minutesFromOrigin"> | null,
  scheduledDepartureAt: Date,
  now: Date,
  actualDepartureAt: Date | null = null,
): number {
  if (!lastReached) {
    // Not past the origin yet: the scheduled time, or the run time if the trip is late to leave
    const scheduled = scheduledDepartureAt.getTime() + target.minutesFromOrigin * 60_000;
    return Math.max(target.minutesFromOrigin * 60, Math.round((scheduled - now.getTime()) / 1000));
  }
  return Math.max(
    0,
    Math.round(
      (target.minutesFromOrigin - lastReached.minutesFromOrigin) *
        60 *
        paceFactor(lastReached, actualDepartureAt, now),
    ),
  );
}

export function paceFactor(
  lastReached: Pick<RouteStopRef, "minutesFromOrigin"> | null,
  actualDepartureAt: Date | null,
  now: Date,
): number {
  if (!lastReached || lastReached.minutesFromOrigin <= 0 || !actualDepartureAt) return 1;
  return Math.max(
    0.8,
    Math.min(
      1.5,
      (now.getTime() - actualDepartureAt.getTime()) / 60_000 / lastReached.minutesFromOrigin,
    ),
  );
}

/** Physical proximity is required to advance the persisted last reached stop. */
export function reachedStop(
  stops: readonly RouteStopRef[],
  point: Coordinate,
  kmAlong: number,
  lastStopSeq: number | null,
): RouteStopRef | null {
  const candidates = stops.filter(
    (s) =>
      s.kmFromOrigin <= kmAlong + CURRENT_STOP_SLACK_KM &&
      haversineKm(point, [s.lat, s.lng]) <= STOP_REACHED_KM,
  );
  const seq = Math.max(lastStopSeq ?? -1, ...candidates.map((s) => s.seq));
  return stops.find((s) => s.seq === seq) ?? null;
}

export function delayNotificationBand(delay: number): number | null {
  return delay < 10 ? null : 10 + Math.floor((delay - 10) / 15) * 15;
}
