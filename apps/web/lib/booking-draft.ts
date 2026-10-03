import { CreateBookingPassengerInput, PublicId } from "@aptransit/shared";
import { useCallback, useSyncExternalStore } from "react";
import { z } from "zod";

// The booking flow spans three pages. Its draft lives in session storage, one per trip, so Back,
// Refresh and a SEAT_TAKEN round trip keep the user's choices and typed names.

/** Half typed values are fine here; step 2 validates with the shared schema before booking. */
const PassengerDraft = z.object({
  name: z.string().max(100).optional(),
  age: z.union([z.number(), z.string().max(3)]).optional(),
  gender: CreateBookingPassengerInput.shape.gender.optional(),
});

export const BookingDraft = z.object({
  from: PublicId.optional(),
  to: PublicId.optional(),
  seats: z.array(z.string()).default([]),
  /** Typed passenger details, by seat number. */
  passengers: z.record(z.string(), PassengerDraft).default({}),
  /** Set after POST /bookings succeeds. */
  bookingId: PublicId.optional(),
  /** What the booking was created with, to tell whether step 2 changed since. */
  bookedSnapshot: z.string().optional(),
  /** Seat lost to someone else, shown once on step 1 (SEAT_TAKEN). */
  takenSeat: z.string().optional(),
});
export type BookingDraft = z.infer<typeof BookingDraft>;
export type PassengerDraft = z.infer<typeof PassengerDraft>;

const EMPTY: BookingDraft = { seats: [], passengers: {} };
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

/** Passenger fields in seat order, for comparing with what the booking was created with. */
export function passengerSnapshot(draft: BookingDraft): string {
  return JSON.stringify(draft.seats.map((seatNo) => ({ seatNo, ...draft.passengers[seatNo] })));
}
