import type { Redis } from "ioredis";

/**
 * One device per citizen: a sign in on a new device ends the sessions (refresh token families) on
 * the others. The ended family ids live in Redis so the guard can refuse their access tokens at
 * once instead of after the 15 minute lifetime. Redis errors fail open, like the rate limits.
 */
const key = (familyId: string) => `auth:ended:${familyId}`;

export async function markSessionsEnded(redis: Redis, familyIds: string[], ttlSec: number): Promise<void> {
  try {
    await Promise.all(familyIds.map((id) => redis.set(key(id), "1", "EX", Math.ceil(ttlSec))));
  } catch {
    // The refresh tokens are already revoked; the old access token then lasts at most 15 minutes
  }
}

export async function sessionEnded(redis: Redis | undefined, familyId: string | undefined): Promise<boolean> {
  if (!redis || !familyId) return false;
  try {
    return (await redis.get(key(familyId))) !== null;
  } catch {
    return false;
  }
}
