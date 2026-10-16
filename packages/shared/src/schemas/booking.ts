import { z } from "zod";
import { BookingStatus } from "../enums";
import { PassengerCategory } from "../fare";
import { Paise } from "../money";
import { PublicId } from "./search";

/** docs/07 booking.maxPassengers default. The API reads the live setting; forms use this cap. */
export const BOOKING_MAX_PASSENGERS = 6;

export const CreateBookingPassengerInput = z
  .object({
    /** D-048: travellers are Adult, Child or Senior. The web sends only this (and a seat on reserved trips). */
    category: PassengerCategory.optional(),
    /** Older clients send an age instead; the server turns it into a category. */
    age: z.coerce.number().int().min(1, "Age must be at least 1").max(120, "Age must be at most 120").optional(),
    /** Never required: tickets carry the account name (D-048). */
    name: z.string().trim().min(1, "Name is required").max(100, "Name too long").optional(),
    gender: z.enum(["F", "M", "X"]).optional(),
    /** Reserved trips need a seat. Seatless trips (D-046) never take one: the server assigns a hidden label. */
    seatNo: z.string().trim().min(1, "Seat number is required").optional(),
  })
  .refine((p) => p.category !== undefined || p.age !== undefined, {
    path: ["category"],
    message: "Pick adult, child or senior",
  });
export type CreateBookingPassengerInput = z.infer<typeof CreateBookingPassengerInput>;

export const CreateBookingInput = z.object({
  tripId: PublicId,
  boardingStopId: PublicId,
  droppingStopId: PublicId,
  passengers: z
    .array(CreateBookingPassengerInput)
    .min(1, "At least 1 passenger is required")
    .max(BOOKING_MAX_PASSENGERS, `Maximum ${BOOKING_MAX_PASSENGERS} passengers per booking`),
  useFreeTravel: z.boolean().optional().default(false),
});
export type CreateBookingInput = z.infer<typeof CreateBookingInput>;

export const BookingPassengerDto = z.object({
  id: z.string(),
  name: z.string(),
  category: PassengerCategory,
  /** Only on bookings made with an age (before D-048). */
  age: z.number().int().nullable(),
  gender: z.string(),
  seatNo: z.string(),
});
export type BookingPassengerDto = z.infer<typeof BookingPassengerDto>;

export const BookingDto = z.object({
  id: z.string(),
  code: z.string(),
  status: BookingStatus,
  totalPaise: Paise,
  holdExpiresAt: z.string().datetime(),
  tripId: z.string(),
  boardingStopId: z.string(),
  droppingStopId: z.string(),
  passengers: z.array(BookingPassengerDto),
  createdAt: z.string().datetime(),
});
export type BookingDto = z.infer<typeof BookingDto>;
