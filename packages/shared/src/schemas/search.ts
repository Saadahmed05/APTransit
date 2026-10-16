import { z } from "zod";
import { ServiceType } from "../enums";
import { Paise } from "../money";
import { DisplayStatus } from "../status";

// Trip search and trip summaries (docs/06, "Network, search, timetable").

/** Public ids are cuid2 (docs/06 Basics). Kept loose on length so seeded and generated ids both pass. */
export const PublicId = z.string().trim().regex(/^[a-z0-9]{8,40}$/, "Invalid id");

/** Calendar date in IST as YYYY-MM-DD, checked to be a real date (no 2026-02-30). */
export const ServiceDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
  .refine((value) => {
    const [y, m, d] = value.split("-").map(Number) as [number, number, number];
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  }, "Date does not exist");

/** Local IST clock time HH:mm, 00:00 to 23:59. */
export const LocalTimeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:mm");

export const SearchTripsQuery = z
  .object({
    from: PublicId,
    to: PublicId,
    date: ServiceDateString,
    after: LocalTimeString.optional(),
  })
  .refine((q) => q.from !== q.to, { message: "From and To must be different", path: ["to"] });
export type SearchTripsQuery = z.infer<typeof SearchTripsQuery>;

/** One trip as shown in search results and timetables. Times are ISO UTC at the passenger's boarding and dropping stops. */
export const TripSummaryDto = z.object({
  tripId: z.string(),
  routeCode: z.string(),
  serviceType: ServiceType,
  departureAt: z.string().datetime(),
  arrivalAt: z.string().datetime(),
  durationMin: z.number().int().nonnegative(),
  /** Total for one passenger including the reservation fee, from fare.ts. */
  farePaise: Paise,
  seatsLeft: z.number().int().nonnegative(),
  displayStatus: DisplayStatus,
  delayMinutes: z.number().int().nonnegative(),
  freeTravelEligible: z.boolean(),
  /** D-046, D-048: no seats on this segment (local service or 50 km or less). */
  seatless: z.boolean().default(false),
});
export type TripSummaryDto = z.infer<typeof TripSummaryDto>;

export const SearchTripsResponse = z.array(TripSummaryDto);
export type SearchTripsResponse = z.infer<typeof SearchTripsResponse>;
