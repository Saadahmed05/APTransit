import { z } from "zod";
import { BookingStatus } from "../enums";
import { Paise } from "../money";
import { PublicId } from "./search";

export const CreateBookingPassengerInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name too long"),
  age: z.coerce.number().int().min(1, "Age must be at least 1").max(120, "Age must be at most 120"),
  gender: z.enum(["F", "M", "X"]),
  seatNo: z.string().trim().min(1, "Seat number is required"),
});
export type CreateBookingPassengerInput = z.infer<typeof CreateBookingPassengerInput>;

export const CreateBookingInput = z.object({
  tripId: PublicId,
  boardingStopId: PublicId,
  droppingStopId: PublicId,
  passengers: z
    .array(CreateBookingPassengerInput)
    .min(1, "At least 1 passenger is required")
    .max(6, "Maximum 6 passengers per booking"),
  useFreeTravel: z.boolean().optional().default(false),
});
export type CreateBookingInput = z.infer<typeof CreateBookingInput>;

export const BookingPassengerDto = z.object({
  id: z.string(),
  name: z.string(),
  age: z.number().int(),
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
