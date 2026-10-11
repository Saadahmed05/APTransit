import {
  type BusStandDto,
  type BusStandRouteDto,
  type DistrictDto,
  type PlaceDto,
  PlacesNearbyQuery,
  PlacesSearchQuery,
  type NearbyPlaceDto,
  PublicId,
  type RouteDto,
  SearchTripsQuery,
  type StateDto,
  type TimetableDto,
  TimetableQuery,
  type TripSummaryDto,
} from "@aptransit/shared";
import { Controller, Get, Param, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../../common/decorators/public.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { NetworkService } from "./network.service";

/** docs/12: search and places search are limited to 60 per IP per minute (per user when logged in). */
const SEARCH_LIMIT = { default: { limit: 60, ttl: 60_000 } };

/** Public network, timetable and search endpoints (docs/06). Everything else uses the default limit. */
@Public()
@Controller()
export class NetworkController {
  constructor(private readonly network: NetworkService) {}

  @Throttle(SEARCH_LIMIT)
  @Get("places/search")
  searchPlaces(
    @Query(new ZodValidationPipe(PlacesSearchQuery)) query: PlacesSearchQuery,
  ): Promise<PlaceDto[]> {
    return this.network.searchPlaces(query);
  }

  @Throttle(SEARCH_LIMIT)
  @Get("places/nearby")
  nearbyPlaces(
    @Query(new ZodValidationPipe(PlacesNearbyQuery)) query: PlacesNearbyQuery,
  ): Promise<NearbyPlaceDto[]> {
    return this.network.nearbyPlaces(query);
  }

  /** D-034: active states with their map view, for the gov state picker and maps. */
  @Get("states")
  states(): Promise<StateDto[]> {
    return this.network.states();
  }

  @Get("districts")
  districts(): Promise<DistrictDto[]> {
    return this.network.districts();
  }

  @Get("districts/:id/bus-stands")
  busStands(@Param("id", new ZodValidationPipe(PublicId)) id: string): Promise<BusStandDto[]> {
    return this.network.busStandsOfDistrict(id);
  }

  @Get("bus-stands/:id/routes")
  busStandRoutes(
    @Param("id", new ZodValidationPipe(PublicId)) id: string,
  ): Promise<BusStandRouteDto[]> {
    return this.network.routesOfBusStand(id);
  }

  @Get("routes/:id")
  route(@Param("id", new ZodValidationPipe(PublicId)) id: string): Promise<RouteDto> {
    return this.network.route(id);
  }

  @Get("routes/:id/timetable")
  timetable(
    @Param("id", new ZodValidationPipe(PublicId)) id: string,
    @Query(new ZodValidationPipe(TimetableQuery)) query: TimetableQuery,
  ): Promise<TimetableDto> {
    return this.network.timetable(id, query.date);
  }

  @Throttle(SEARCH_LIMIT)
  @Get("search/trips")
  searchTrips(
    @Query(new ZodValidationPipe(SearchTripsQuery)) query: SearchTripsQuery,
  ): Promise<TripSummaryDto[]> {
    return this.network.searchTrips(query);
  }
}
