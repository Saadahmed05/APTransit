import { z } from "zod";
import { ServiceType } from "../enums";
import { Paise } from "../money";
import { DisplayStatus } from "../status";
import { RouteDto } from "./network";
import { PublicId, ServiceDateString } from "./search";
import { SeatLayoutSchema } from "./seat-layout";

export const TripBoardingPointDto = z.object({
  stopId: z.string(),
  nameEn: z.string(),
  nameTe: z.string(),
  seq: z.number().int().nonnegative(),
  kmFromOrigin: z.number().nonnegative(),
  minutesFromOrigin: z.number().int().nonnegative(),
  departureAt: z.string().datetime(),
});
export type TripBoardingPointDto = z.infer<typeof TripBoardingPointDto>;

export const TripDroppingPointDto = z.object({
  stopId: z.string(),
  nameEn: z.string(),
  nameTe: z.string(),
  seq: z.number().int().nonnegative(),
  kmFromOrigin: z.number().nonnegative(),
  minutesFromOrigin: z.number().int().nonnegative(),
  arrivalAt: z.string().datetime(),
});
export type TripDroppingPointDto = z.infer<typeof TripDroppingPointDto>;

export const TripStopTimelineDto = z.object({
  stopId: z.string(),
  code: z.string(),
  nameEn: z.string(),
  nameTe: z.string(),
  seq: z.number().int().nonnegative(),
  kmFromOrigin: z.number().nonnegative(),
  minutesFromOrigin: z.number().int().nonnegative(),
  isBoarding: z.boolean(),
  isDropping: z.boolean(),
  scheduledArrivalAt: z.string().datetime(),
  scheduledDepartureAt: z.string().datetime(),
  actualArrivalAt: z.string().datetime().nullable().optional(),
  actualDepartureAt: z.string().datetime().nullable().optional(),
});
export type TripStopTimelineDto = z.infer<typeof TripStopTimelineDto>;

export const TripBusTypeDto = z.object({
  id: z.string(),
  serviceType: ServiceType,
  nameEn: z.string(),
  nameTe: z.string(),
  isAc: z.boolean(),
  totalSeats: z.number().int().positive(),
  freeTravelEligible: z.boolean(),
});
export type TripBusTypeDto = z.infer<typeof TripBusTypeDto>;

export const TripDetailDto = z.object({
  tripId: z.string(),
  serviceDate: ServiceDateString,
  route: RouteDto,
  busType: TripBusTypeDto,
  busRegNo: z.string().nullable().optional(),
  boardingPoints: z.array(TripBoardingPointDto),
  droppingPoints: z.array(TripDroppingPointDto),
  stops: z.array(TripStopTimelineDto),
  seatsLeft: z.number().int().nonnegative(),
  displayStatus: DisplayStatus,
  delayMinutes: z.number().int().nonnegative(),
  scheduledDepartureAt: z.string().datetime(),
  scheduledArrivalAt: z.string().datetime(),
  freeTravelEligible: z.boolean(),
  farePaise: Paise.optional(),
});
export type TripDetailDto = z.infer<typeof TripDetailDto>;

export const SeatState = z.enum(["FREE", "TAKEN", "HELD", "BLOCKED"]);
export type SeatState = z.infer<typeof SeatState>;

export const SeatMapItemDto = z.object({
  seatNo: z.string(),
  state: SeatState,
});
export type SeatMapItemDto = z.infer<typeof SeatMapItemDto>;

export const SeatMapDto = z.object({
  layout: SeatLayoutSchema,
  seats: z.array(SeatMapItemDto),
});
export type SeatMapDto = z.infer<typeof SeatMapDto>;

export const TripSeatsQuery = z.object({
  from: PublicId.optional(),
  to: PublicId.optional(),
});
export type TripSeatsQuery = z.infer<typeof TripSeatsQuery>;

export const RefundTierDto = z.object({
  minHoursBefore: z.number().nonnegative(),
  percent: z.number().int().min(0).max(100),
});
export type RefundTierDto = z.infer<typeof RefundTierDto>;

export const FareDto = z.object({
  basePaise: Paise,
  reservationFeePaise: Paise,
  totalPaise: Paise,
  distanceKm: z.number().nonnegative(),
  refundTiers: z.array(RefundTierDto),
});
export type FareDto = z.infer<typeof FareDto>;

export const TripFareQuery = z.object({
  from: PublicId,
  to: PublicId,
});
export type TripFareQuery = z.infer<typeof TripFareQuery>;
