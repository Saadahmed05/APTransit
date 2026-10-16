import { PublicId } from "@aptransit/shared";
import { useCallback, useSyncExternalStore } from "react";
import { z } from "zod";

// The booking flow spans up to three pages. Its draft lives in session storage, one per trip, so
// Back, Refresh and a SEAT_TAKEN round trip keep the user's choices.

/** D-048: how many travellers of each category; nobody types names, ages or gender. */
export const TravellerCounts = z.object({
  ADULT: z.number().int().min(0).max(6).default(1),
  CHILD: z.number().int().min(0).max(6).default(0),
  SENIOR: z.number().int().min(0).max(6).default(0),
});
export type TravellerCounts = z.infer<typeof TravellerCounts>;

export const BookingDraft = z.object({
  from: PublicId.optional(),
  to: PublicId.optional(),
  counts: TravellerCounts.default({ ADULT: 1, CHILD: 0, SENIOR: 0 }),
  seats: z.array(z.string()).default([]),
  /** Set after POST /bookings succeeds. */
  bookingId: PublicId.optional(),
  /** What the booking was created with, to tell whether the choices changed since. */
  bookedSnapshot: z.string().optional(),
  /** Seat lost to someone else, shown once on the seats step (SEAT_TAKEN). */
  takenSeat: z.string().optional(),
});
export type BookingDraft = z.infer<typeof BookingDraft>;

const EMPTY: BookingDraft = { counts: { ADULT: 1, CHILD: 0, SENIOR: 0 }, seats: [] };
const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: BookingDraft }>();

function storageKey(tripId: string): string {
  return `apt.booking.${tripId}`;
}

export function readDraft(tripId: string): BookingDraft {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(storageKey(tripId));
  } catch {
    // Storage blocked: the flow still works inside one page
  }
  const hit = cache.get(tripId);
  if (hit && hit.raw === raw) return hit.value;
  let value = EMPTY;
  try {
    const parsed = BookingDraft.safeParse(JSON.parse(raw ?? "null"));
    if (parsed.success) value = parsed.data;
  } catch {
    // Corrupt value: start over
  }
  cache.set(tripId, { raw, value });
  return value;
}

export function writeDraft(tripId: string, update: (draft: BookingDraft) => BookingDraft): BookingDraft {
  const next = update(readDraft(tripId));
  try {
    window.sessionStorage.setItem(storageKey(tripId), JSON.stringify(next));
  } catch {
    cache.set(tripId, { raw: JSON.stringify(next), value: next });
  }
  listeners.forEach((listener) => listener());
  return next;
}

export function clearDraft(tripId: string): void {
  try {
    window.sessionStorage.removeItem(storageKey(tripId));
  } catch {
    // Nothing stored
  }
  cache.delete(tripId);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The draft for a trip, or null during server render and hydration (storage is browser only).
 * Returns a stable object until the draft changes.
 */
export function useBookingDraft(tripId: string): [BookingDraft | null, (update: (draft: BookingDraft) => BookingDraft) => void] {
  const draft = useSyncExternalStore(
    subscribe,
    () => readDraft(tripId),
    () => null,
  );
  const update = useCallback((fn: (draft: BookingDraft) => BookingDraft) => void writeDraft(tripId, fn), [tripId]);
  return [draft, update];
}

/** The choices a booking is made from, to tell whether it still matches the draft. */
export function bookingSnapshot(draft: BookingDraft): string {
  return JSON.stringify({ from: draft.from, to: draft.to, counts: draft.counts, seats: draft.seats });
}

export function travellerTotal(counts: TravellerCounts): number {
  return counts.ADULT + counts.CHILD + counts.SENIOR;
}
