import type { FareDto, SeatMapDto, TripDetailDto } from "@aptransit/shared";
import { PublicId, TripFareQuery, TripSeatsQuery } from "@aptransit/shared";
import { Controller, Get, Param, Query } from "@nestjs/common";
import { Public } from "../../common/decorators/public.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { TripsService } from "./trips.service";

@Controller("trips")
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Public()
  @Get(":id")
  getTrip(
    @Param("id", new ZodValidationPipe(PublicId)) id: string,
    @Query(new ZodValidationPipe(TripSeatsQuery)) query: TripSeatsQuery,
  ): Promise<TripDetailDto> {
    return this.tripsService.getTrip(id, query.from, query.to);
  }

  @Public()
  @Get(":id/seats")
  getSeats(
    @Param("id", new ZodValidationPipe(PublicId)) id: string,
    @Query(new ZodValidationPipe(TripSeatsQuery)) _query: TripSeatsQuery,
  ): Promise<SeatMapDto> {
    return this.tripsService.getSeats(id);
  }

  @Public()
  @Get(":id/fare")
  getFare(
    @Param("id", new ZodValidationPipe(PublicId)) id: string,
    @Query(new ZodValidationPipe(TripFareQuery)) query: TripFareQuery,
  ): Promise<FareDto> {
    return this.tripsService.getFare(id, query.from, query.to);
  }
}
