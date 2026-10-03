import type { Redis } from "ioredis";

/**
 * Seat holds (docs/13): hold:{tripId}:{seatNo} = bookingId, plus holdcount:{tripId} for search.
 * Both scripts are one Redis command each, so a hold is all or nothing and a release only
 * removes keys that still belong to the booking (a late release never frees someone else's seat).
 */

/** Hold keys outlive holdExpiresAt by this much so the expiry job still finds and counts them. */
export const HOLD_GRACE_SEC = 60;

// Returns 0 when every seat was held, otherwise the 1-based index of the first seat already held.
const HOLD_SCRIPT = `
-- seat-hold
local n = #KEYS - 1
for i = 1, n do
  if redis.call("EXISTS", KEYS[i]) == 1 then
    return i
  end
end
for i = 1, n do
  redis.call("SET", KEYS[i], ARGV[1], "EX", ARGV[2])
end
redis.call("INCRBY", KEYS[#KEYS], n)
if redis.call("TTL", KEYS[#KEYS]) < tonumber(ARGV[3]) then
  redis.call("EXPIRE", KEYS[#KEYS], ARGV[3])
end
return 0
`;

// Returns how many of the keys belonged to the booking and were released.
const RELEASE_SCRIPT = `
-- seat-release
local n = #KEYS - 1
local released = 0
for i = 1, n do
  if redis.call("GET", KEYS[i]) == ARGV[1] then
    redis.call("DEL", KEYS[i])
    released = released + 1
  end
end
if released > 0 then
  local left = redis.call("DECRBY", KEYS[#KEYS], released)
  if left <= 0 then
    redis.call("DEL", KEYS[#KEYS])
  end
end
return released
`;

export function holdKey(tripId: string, seatNo: string): string {
  return `hold:${tripId}:${seatNo}`;
}

export function holdCountKey(tripId: string): string {
  return `holdcount:${tripId}`;
}

/** Holds every seat for the booking, or none. Returns the first seat that is already held, or null. */
export async function holdSeats(
  client: Redis,
  tripId: string,
  seatNos: string[],
  bookingId: string,
  ttlSec: number,
): Promise<string | null> {
  const keys = [...seatNos.map((seatNo) => holdKey(tripId, seatNo)), holdCountKey(tripId)];
  const holdTtl = ttlSec + HOLD_GRACE_SEC;
  const result = Number(
    await client.eval(HOLD_SCRIPT, keys.length, ...keys, bookingId, String(holdTtl), String(holdTtl + 60)),
  );
  return result === 0 ? null : (seatNos[result - 1] ?? seatNos[0] ?? null);
}

/** Releases the seats still held by this booking and lowers the trip counter. */
export async function releaseSeats(
  client: Redis,
  tripId: string,
  seatNos: string[],
  bookingId: string,
): Promise<number> {
  if (seatNos.length === 0) return 0;
  const keys = [...seatNos.map((seatNo) => holdKey(tripId, seatNo)), holdCountKey(tripId)];
  return Number(await client.eval(RELEASE_SCRIPT, keys.length, ...keys, bookingId));
}
