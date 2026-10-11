import { z } from "zod";
import { ServiceType } from "../enums";
import { LocalTimeString, PublicId, ServiceDateString, TripSummaryDto } from "./search";

// Public network endpoints (docs/06, "Network, search, timetable").

export const PlaceKind = z.enum(["STOP", "BUS_STAND"]);
export type PlaceKind = z.infer<typeof PlaceKind>;

export const PLACES_SEARCH_MAX_LIMIT = 20;
export const PLACES_SEARCH_DEFAULT_LIMIT = 10;

export const PlacesSearchQuery = z.object({
  q: z.string().trim().min(2, "Type at least 2 characters").max(60),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(PLACES_SEARCH_MAX_LIMIT)
    .default(PLACES_SEARCH_DEFAULT_LIMIT),
});
export type PlacesSearchQuery = z.infer<typeof PlacesSearchQuery>;

/** A place is a stop. `kind` is BUS_STAND when the stop is a bus stand. `id` is the stop id used by search. */
export const PlaceDto = z.object({
  id: z.string(),
  kind: PlaceKind,
  nameEn: z.string(),
  nameTe: z.string(),
  districtNameEn: z.string(),
  districtNameTe: z.string(),
  /** D-042: coordinates for the map picker. */
  lat: z.number().optional(),
  lng: z.number().optional(),
});
export type PlaceDto = z.infer<typeof PlaceDto>;

/** D-042: GET /places/nearby, stops closest to a point (the map and "use my location"). */
export const PlacesNearbyQuery = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type PlacesNearbyQuery = z.infer<typeof PlacesNearbyQuery>;
export const NearbyPlaceDto = PlaceDto.extend({
  lat: z.number(),
  lng: z.number(),
  distanceKm: z.number().nonnegative(),
});
export type NearbyPlaceDto = z.infer<typeof NearbyPlaceDto>;
export const PlacesNearbyResponse = z.array(NearbyPlaceDto);
export const PlacesSearchResponse = z.array(PlaceDto);

/** GET /states (D-034): a state with its map view. Bounds are [minLng, minLat, maxLng, maxLat]. */
export const StateDto = z.object({
  id: z.string(),
  code: z.string(),
  nameEn: z.string(),
  nameTe: z.string(),
  center: z.object({ lat: z.number(), lng: z.number() }),
  bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  zoom: z.number().int(),
});
export type StateDto = z.infer<typeof StateDto>;
export const StatesResponse = z.array(StateDto);

export const DistrictDto = z.object({
  id: z.string(),
  code: z.string(),
  nameEn: z.string(),
  nameTe: z.string(),
  stateId: z.string(),
  busStandCount: z.number().int().nonnegative(),
});
export type DistrictDto = z.infer<typeof DistrictDto>;
export const DistrictsResponse = z.array(DistrictDto);

export const BusStandDto = z.object({
  id: z.string(),
  nameEn: z.string(),
  nameTe: z.string(),
  routeCount: z.number().int().nonnegative(),
});
export type BusStandDto = z.infer<typeof BusStandDto>;
export const BusStandsResponse = z.array(BusStandDto);

export const StopRefDto = z.object({
  id: z.string(),
  nameEn: z.string(),
  nameTe: z.string(),
});
export type StopRefDto = z.infer<typeof StopRefDto>;

/** A route leaving a bus stand, with the service types that run on it. */
export const BusStandRouteDto = z.object({
  id: z.string(),
  code: z.string(),
  nameEn: z.string(),
  nameTe: z.string(),
  destination: StopRefDto,
  serviceTypes: z.array(ServiceType),
});
export type BusStandRouteDto = z.infer<typeof BusStandRouteDto>;
export const BusStandRoutesResponse = z.array(BusStandRouteDto);

export const RouteStopDto = z.object({
  stopId: z.string(),
  seq: z.number().int().nonnegative(),
  nameEn: z.string(),
  nameTe: z.string(),
  kind: PlaceKind,
  lat: z.number(),
  lng: z.number(),
  kmFromOrigin: z.number().nonnegative(),
  minutesFromOrigin: z.number().int().nonnegative(),
  isBoarding: z.boolean(),
  isDropping: z.boolean(),
});
export type RouteStopDto = z.infer<typeof RouteStopDto>;

export const RouteDto = z.object({
  id: z.string(),
  code: z.string(),
  nameEn: z.string(),
  nameTe: z.string(),
  distanceKm: z.number().nonnegative(),
  /** Google encoded polyline (see polyline.ts). */
  polyline: z.string(),
  origin: StopRefDto,
  destination: StopRefDto,
  /** Ordered by seq, origin first. */
  stops: z.array(RouteStopDto),
});
export type RouteDto = z.infer<typeof RouteDto>;

export const RouteIdParam = PublicId;

export const TimetableQuery = z.object({
  /** Service date in IST. Defaults to today (IST) when missing. */
  date: ServiceDateString.optional(),
});
export type TimetableQuery = z.infer<typeof TimetableQuery>;

export const TimetableDto = z.object({
  date: ServiceDateString,
  /** Departure from the route origin, local IST HH:mm. Null when nothing runs that day. */
  firstDepartureLocal: LocalTimeString.nullable(),
  lastDepartureLocal: LocalTimeString.nullable(),
  /** Next departure from the origin after now, on that date. Null when none is left. */
  nextDepartureAt: z.string().datetime().nullable(),
  /** Median gap between departures in minutes. Null with fewer than two trips. */
  frequencyMin: z.number().int().positive().nullable(),
  trips: z.array(TripSummaryDto),
});
export type TimetableDto = z.infer<typeof TimetableDto>;
