import { type LiveBusDto, LiveTrackingQuery, type LiveTripDto, PublicId, TrackingPingInput } from "@aptransit/shared";
import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { AuthenticatedUser } from "../../common/auth/auth.types";
import { Can } from "../../common/decorators/can.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { TrackingService } from "./tracking.service";

@Controller("tracking")
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  /** docs/12: 30 per device per minute (one device per driver session). 202: the work is done, nothing to return. */
  @Post("ping")
  @Can("driver:trip")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.ACCEPTED)
  async ping(
    @CurrentUser() user: AuthenticatedUser,
    @Headers("x-device-key") deviceKey: string | undefined,
    @Body(new ZodValidationPipe(TrackingPingInput)) body: TrackingPingInput,
  ): Promise<void> {
    await this.tracking.ping(user.id, deviceKey, body);
  }

  @Public()
  @Get("trips/:id/live")
  live(@Param("id", new ZodValidationPipe(PublicId)) id: string): Promise<LiveTripDto> {
    return this.tracking.live(id);
  }

  @Get("live")
  @Can("ops:read")
  liveBuses(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(LiveTrackingQuery)) query: LiveTrackingQuery,
  ): Promise<LiveBusDto[]> {
    return this.tracking.liveBuses(user, query.depotId, query.districtId);
  }
}
