import {
  GovDateQuery,
  GovDepotSummaryDto,
  GovDistrictSummaryDto,
  GovMapDto,
  GovOverviewDto,
  GovRouteSummaryDto,
  GovStateQuery,
  PublicId,
} from "@aptransit/shared";
import { Controller, Get, Param, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { AuthenticatedUser } from "../../common/auth/auth.types";
import { Can } from "../../common/decorators/can.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { GovService } from "./gov.service";

const idPipe = new ZodValidationPipe(PublicId);
const dateQueryPipe = new ZodValidationPipe(GovDateQuery);
const stateQueryPipe = new ZodValidationPipe(GovStateQuery);

@Controller("gov")
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class GovController {
  constructor(private readonly govService: GovService) {}

  @Get("overview")
  @Can("gov:read")
  async overview(
    @CurrentUser() user: AuthenticatedUser,
    @Query(stateQueryPipe) query: GovStateQuery,
  ): Promise<GovOverviewDto> {
    return this.govService.overview(user, query.date, query.stateId);
  }

  @Get("map")
  @Can("gov:read")
  async map(
    @CurrentUser() user: AuthenticatedUser,
    @Query(stateQueryPipe) query: GovStateQuery,
  ): Promise<GovMapDto> {
    return this.govService.map(user, query.stateId);
  }

  @Get("districts/:id")
  @Can("gov:read")
  async district(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", idPipe) id: string,
    @Query(dateQueryPipe) query: GovDateQuery,
  ): Promise<GovDistrictSummaryDto> {
    return this.govService.districtSummary(user, id, query.date);
  }

  @Get("depots/:id")
  @Can("gov:read")
  async depot(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", idPipe) id: string,
    @Query(dateQueryPipe) query: GovDateQuery,
  ): Promise<GovDepotSummaryDto> {
    return this.govService.depotSummary(user, id, query.date);
  }

  @Get("routes/:id")
  @Can("gov:read")
  async route(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", idPipe) id: string,
    @Query(dateQueryPipe) query: GovDateQuery,
  ): Promise<GovRouteSummaryDto> {
    return this.govService.routeSummary(user, id, query.date);
  }
}
