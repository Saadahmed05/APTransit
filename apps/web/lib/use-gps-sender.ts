"use client";

import type { GpsPointInput } from "@aptransit/shared";
import { useEffect, useRef, useState } from "react";
import { api, isApiError } from "./api";
import { bufferedCount, bufferPoints, peekPoints, removePoints } from "./gps-buffer";
import { useNow } from "./use-browser-state";

// docs/13 Driver side. watchPosition (high accuracy), one request every 5 s while moving and every
// 20 s after a minute under 2 km/h, up to 20 points per request, an IndexedDB buffer when offline.

export type GpsStatus = "ACTIVE" | "WEAK" | "OFF";

const MOVING_EVERY_MS = 5_000;
const STATIONARY_EVERY_MS = 20_000;
const STATIONARY_AFTER_MS = 60_000;
const STATIONARY_KMH = 2;
const BATCH = 20;
/** The API refuses points older than 2 min (docs/12); older buffered points are dropped, not resent. */
const MAX_POINT_AGE_MS = 110_000;

/** docs/13: Active (fix under 30 s, accuracy under 50 m), Weak (over 50 m or 30 to 90 s), Off (over 90 s or denied). */
export function gpsStatus(fix: { at: number; accuracyM: number | null } | null, denied: boolean, now: number): GpsStatus {
  if (denied || !fix) return "OFF";
  const age = now - fix.at;
  if (age > 90_000) return "OFF";
  if (age > 30_000 || (fix.accuracyM ?? 0) > 50) return "WEAK";
  return "ACTIVE";
}

export function toPoint(position: GeolocationPosition): GpsPointInput {
  const { latitude, longitude, speed, heading, accuracy } = position.coords;
  return {
    lat: latitude,
    lng: longitude,
    ...(speed !== null && Number.isFinite(speed) ? { speedKmh: Math.max(0, Math.round(speed * 3.6 * 10) / 10) } : {}),
    ...(heading !== null && Number.isFinite(heading) ? { headingDeg: Math.round(heading) % 360 } : {}),
    ...(Number.isFinite(accuracy) ? { accuracyM: Math.round(accuracy) } : {}),
    recordedAt: new Date(position.timestamp).toISOString(),
  };
}

export interface GpsSender {
  status: GpsStatus;
  denied: boolean;
  /** Points waiting in the offline buffer. */
  buffered: number;
  /** Set when the API stopped accepting pings (trip ended elsewhere, device revoked). */
  stoppedCode: string | null;
}

export function useGpsSender({ tripId, deviceKey, enabled }: { tripId: string; deviceKey: string | null; enabled: boolean }): GpsSender {
  const now = useNow(5_000);
  const [fix, setFix] = useState<{ at: number; accuracyM: number | null } | null>(null);
  const [denied, setDenied] = useState(false);
  const [buffered, setBuffered] = useState(0);
  const [stoppedCode, setStoppedCode] = useState<string | null>(null);
  const queue = useRef<GpsPointInput[]>([]);
  const slowSince = useRef<number | null>(null);

  // Positions
  useEffect(() => {
    if (!enabled || !("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (position) => {
        const point = toPoint(position);
        queue.current.push(point);
        if (queue.current.length > 500) queue.current.splice(0, queue.current.length - 500);
        const slow = (point.speedKmh ?? 0) < STATIONARY_KMH;
        slowSince.current = slow ? (slowSince.current ?? position.timestamp) : null;
        setDenied(false);
        setFix({ at: position.timestamp, accuracyM: point.accuracyM ?? null });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) setDenied(true);
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);

  // Sending
  useEffect(() => {
    if (!enabled || !deviceKey) return;
    let timer: number | undefined;
    let stopped = false;

    const send = (points: GpsPointInput[]) =>
      api("/tracking/ping", { method: "POST", body: { tripId, points }, headers: { "X-Device-Key": deviceKey } });

    /** "retry" keeps the points for later; "drop" discards a refused batch; "stop" ends sending. */
    const outcome = (error: unknown): "retry" | "drop" | "stop" => {
      if (!isApiError(error)) return "retry";
      if (error.code === "NETWORK" || error.status >= 500 || error.code === "RATE_LIMITED") return "retry";
      if (error.code === "VALIDATION_FAILED") return "drop";
      return "stop"; // trip no longer running, or this device was revoked
    };

    const tick = async () => {
      const fresh = (p: GpsPointInput) => Date.now() - Date.parse(p.recordedAt) < MAX_POINT_AGE_MS;
      const batch = queue.current.splice(0, BATCH);
      let online = true;
      if (batch.length > 0) {
        try {
          await send(batch);
        } catch (error) {
          const result = outcome(error);
          if (result === "retry") {
            online = false;
            await bufferPoints(tripId, batch);
          } else if (result === "stop") {
            stopped = true;
            setStoppedCode(isApiError(error) ? error.code : "INTERNAL");
          }
        }
      }
      // Back online: flush the buffer 20 at a time, dropping points the API would refuse as stale
      if (online && !stopped) {
        const old = await peekPoints(tripId, BATCH);
        if (old.ids.length > 0) {
          const usable = old.points.filter(fresh);
          try {
            if (usable.length > 0) await send(usable);
            await removePoints(old.ids);
          } catch (error) {
            if (outcome(error) !== "retry") await removePoints(old.ids);
          }
        }
      }
      setBuffered(await bufferedCount());
      if (stopped) return;
      const stationary = slowSince.current !== null && Date.now() - slowSince.current >= STATIONARY_AFTER_MS;
      timer = window.setTimeout(() => void tick(), stationary ? STATIONARY_EVERY_MS : MOVING_EVERY_MS);
    };
    timer = window.setTimeout(() => void tick(), MOVING_EVERY_MS);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [enabled, deviceKey, tripId]);

  // Before the first clock tick (now 0) a fix counts as current
  return { status: now ? gpsStatus(fix, denied, now) : denied || !fix ? "OFF" : "ACTIVE", denied, buffered, stoppedCode };
}
