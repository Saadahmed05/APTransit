import type Redis from "ioredis";

// Day 9: the worker proves it is alive; GET /health reports worker ok or stale (docs/15 budget:
// one SET per minute).
export const WORKER_HEARTBEAT_KEY = "worker:heartbeat";
export const WORKER_HEARTBEAT_EVERY_MS = 60_000;
export const WORKER_HEARTBEAT_TTL_SEC = 180;

export async function writeHeartbeat(client: Pick<Redis, "set">, now = new Date()): Promise<void> {
  await client.set(WORKER_HEARTBEAT_KEY, now.toISOString(), "EX", WORKER_HEARTBEAT_TTL_SEC);
}

/** ok while the key exists (written in the last 3 minutes), stale otherwise. */
export async function readWorkerState(client: Pick<Redis, "get">): Promise<"ok" | "stale"> {
  const value = await client.get(WORKER_HEARTBEAT_KEY);
  return value ? "ok" : "stale";
}
