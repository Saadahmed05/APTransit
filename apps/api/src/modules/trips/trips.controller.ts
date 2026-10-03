import type { FareDto, SeatMapDto, TripDetailDto } from "@aptransit/shared";
import { TripFareQuery, TripSeatsQuery } from "@aptransit/shared";
import { Controller, Get, Param, Query, UsePipes } from "@nestjs/common";
import { Public } from "../../common/decorators/public.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { TripsService } from "./trips.service";

@Controller("trips")
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Public()
  @Get(":id")
  getTrip(
    @Param("id") id: string,
    @Query(new ZodValidationPipe(TripSeatsQuery)) query: TripSeatsQuery,
  ): Promise<TripDetailDto> {
    return this.tripsService.getTrip(id, query.from, query.to);
  }

  @Public()
  @Get(":id/seats")
  getSeats(
    @Param("id") id: string,
  ): Promise<SeatMapDto> {
    return this.tripsService.getSeats(id);
  }

  @Public()
  @Get(":id/fare")
  getFare(
    @Param("id") id: string,
    @Query(new ZodValidationPipe(TripFareQuery)) query: TripFareQuery,
  ): Promise<FareDto> {
    return this.tripsService.getFare(id, query.from, query.to);
  }
}
