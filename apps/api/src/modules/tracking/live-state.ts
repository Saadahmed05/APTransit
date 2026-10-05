import type Redis from "ioredis";

// docs/13 Redis keys. Redis is never the record: the next ping refills everything within 5 s.

export const LIVE_TTL_SEC = 120;
export const SAMPLE_EVERY_MS = 30_000;

export const liveKey = (tripId: string) => `bus:live:${tripId}`;
export const lastSampleKey = (tripId: string) => `trip:lastSample:${tripId}`;
export const depotLiveKey = (depotId: string) => `depot:live:${depotId}`;
export const rejectedPingsKey = (tripId: string) => `gps:rejected:${tripId}`;

/** The JSON in bus:live:{tripId} (docs/13). */
export interface LiveState {
  tripId: string;
  busId: string;
  lat: number;
  lng: number;
  speedKmh: number | null;
  headingDeg: number | null;
  recordedAt: string;
  kmAlong: number;
  nextStopSeq: number | null;
  nextStopId: string | null;
  etaNextStopSec: number | null;
  delayMinutes: number;
  progressPct: number;
}

export async function readLive(client: Pick<Redis, "get">, tripId: string): Promise<LiveState | null> {
  try {
    const raw = await client.get(liveKey(tripId));
    return raw ? (JSON.parse(raw) as LiveState) : null;
  } catch {
    return null;
  }
}

export async function readLiveMany(client: Pick<Redis, "mget">, tripIds: string[]): Promise<Map<string, LiveState>> {
  const out = new Map<string, LiveState>();
  if (tripIds.length === 0) return out;
  try {
    const values = await client.mget(tripIds.map(liveKey));
    values.forEach((raw, index) => {
      if (raw) out.set(tripIds[index]!, JSON.parse(raw) as LiveState);
    });
  } catch {
    // Redis down: no live positions, the API still answers
  }
  return out;
}
