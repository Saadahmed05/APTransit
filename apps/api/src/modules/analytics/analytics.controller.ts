import {
  AnalyticsBusesQuery,
  AnalyticsDelaysQuery,
  AnalyticsDemandQuery,
  AnalyticsPassengersQuery,
  AnalyticsRoutesQuery,
  type BusAnalyticsDto,
  type DelayAnalyticsDto,
  type DemandBandDto,
  type PassengerAnalyticsDto,
  type RouteAnalyticsDto,
} from "@aptransit/shared";
import { Controller, Get, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { AuthenticatedUser } from "../../common/auth/auth.types";
import { Can } from "../../common/decorators/can.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { AnalyticsService } from "./analytics.service";

@Controller("analytics")
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get("routes")
  @Can("gov:read")
  async routes(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(AnalyticsRoutesQuery)) query: AnalyticsRoutesQuery,
  ): Promise<RouteAnalyticsDto[]> {
    return this.analytics.routes(user, query.from, query.to, query.districtId);
  }

  @Get("buses")
  @Can("gov:read")
  async buses(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(AnalyticsBusesQuery)) query: AnalyticsBusesQuery,
  ): Promise<BusAnalyticsDto[]> {
    return this.analytics.buses(user, query.from, query.to, query.depotId);
  }

  @Get("passengers")
  @Can("gov:read")
  async passengers(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(AnalyticsPassengersQuery)) query: AnalyticsPassengersQuery,
  ): Promise<PassengerAnalyticsDto> {
    return this.analytics.passengers(user, query.from, query.to);
  }

  @Get("delays")
  @Can("gov:read")
  async delays(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(AnalyticsDelaysQuery)) query: AnalyticsDelaysQuery,
  ): Promise<DelayAnalyticsDto> {
    return this.analytics.delays(user, query.from, query.to, query.routeId);
  }

  @Get("demand")
  @Can("gov:read")
  async demand(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(AnalyticsDemandQuery)) query: AnalyticsDemandQuery,
  ): Promise<DemandBandDto[]> {
    return this.analytics.demand(user, query.routeId, query.from, query.to);
  }
}
