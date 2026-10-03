import { createHash } from "node:crypto";
import type { Redis } from "ioredis";
import { z } from "zod";
import { AppError } from "../errors/app-error";

// Idempotency-Key handling (docs/06): the key is a uuid; the same key and body return the first
// result for 24 h; the same key with another body is VALIDATION_FAILED. Redis is a cache here:
// when it is down the request simply runs again (the handlers are idempotent themselves).

const IdempotencyKey = z.string().uuid();
const TTL_SEC = 86_400;

export interface IdempotencySlot {
  key: string;
  bodyHash: string;
}

/** Null when the caller sent no key. Throws VALIDATION_FAILED when the key is not a uuid. */
export function idempotencySlot(scope: string, userId: string, key: string | undefined, body: unknown): IdempotencySlot | null {
  if (key === undefined) return null;
  if (!IdempotencyKey.safeParse(key).success) {
    throw new AppError("VALIDATION_FAILED", "Idempotency-Key must be a uuid");
  }
  return {
    key: `idemp:${scope}:${userId}:${key}`,
    bodyHash: createHash("sha256").update(JSON.stringify(body)).digest("hex"),
  };
}

export async function readIdempotent<T>(client: Redis, slot: IdempotencySlot | null): Promise<T | null> {
  if (!slot) return null;
  let cached: { bodyHash: string; result: T } | null = null;
  try {
    const raw = await client.get(slot.key);
    cached = raw ? (JSON.parse(raw) as { bodyHash: string; result: T }) : null;
  } catch {
    return null;
  }
  if (cached && cached.bodyHash !== slot.bodyHash) {
    throw new AppError("VALIDATION_FAILED", "Idempotency-Key was already used with a different body");
  }
  return cached?.result ?? null;
}

export async function writeIdempotent<T>(client: Redis, slot: IdempotencySlot | null, result: T): Promise<void> {
  if (!slot) return;
  try {
    await client.set(slot.key, JSON.stringify({ bodyHash: slot.bodyHash, result }), "EX", TTL_SEC);
  } catch {
    // Non-critical cache
  }
}
