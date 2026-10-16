import { BookingDto, categoriesFromCounts, type CreateBookingPassengerInput } from "@aptransit/shared";
import { api, isApiError } from "./api";
import { bookingSnapshot, writeDraft } from "./booking-draft";

export type SubmitResult =
  | { kind: "booked"; bookingId: string }
  | { kind: "seatTaken"; seat: string }
  | { kind: "error"; error: unknown };

/**
 * D-048: creates the booking from the draft (traveller counts, and seats on reserved trips).
 * Reuses a booking that already matches the draft, gives an outdated hold back first, and turns
 * SEAT_TAKEN into a seat to drop from the draft.
 */
export async function submitBooking(tripId: string, options: { withSeats: boolean }): Promise<SubmitResult> {
  const current = writeDraft(tripId, (d) => d);
  const snapshot = bookingSnapshot(current);
  // Back from review without changes: the booking and its hold are still good
  if (current.bookingId && current.bookedSnapshot === snapshot) return { kind: "booked", bookingId: current.bookingId };
  if (current.bookingId) {
    await api(`/bookings/${current.bookingId}`, { method: "DELETE" }).catch(() => undefined);
    writeDraft(tripId, (d) => ({ ...d, bookingId: undefined, bookedSnapshot: undefined }));
  }

  const categories = categoriesFromCounts(current.counts);
  const passengers: CreateBookingPassengerInput[] = categories.map((category, i) =>
    options.withSeats ? { category, seatNo: current.seats[i] } : { category },
  );
  try {
    const booking = await api("/bookings", {
      method: "POST",
      // One key per attempt: a network retry of this request cannot create a second booking
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: { tripId, boardingStopId: current.from, droppingStopId: current.to, passengers },
      schema: BookingDto,
    });
    writeDraft(tripId, (d) => ({ ...d, bookingId: booking.id, bookedSnapshot: snapshot }));
    return { kind: "booked", bookingId: booking.id };
  } catch (error) {
    if (options.withSeats && isApiError(error) && error.code === "SEAT_TAKEN") {
      const seat = typeof error.details?.seatNo === "string" ? error.details.seatNo : (current.seats[0] ?? "");
      writeDraft(tripId, (d) => ({
        ...d,
        seats: d.seats.filter((s) => s !== seat),
        takenSeat: seat,
        bookingId: undefined,
        bookedSnapshot: undefined,
      }));
      return { kind: "seatTaken", seat };
    }
    return { kind: "error", error };
  }
}
