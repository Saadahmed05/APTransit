import {
  DriverIncidentInput,
  type DriverTodayDto,
  type DriverTripSummaryDto,
  type IncidentDto,
  PublicId,
  RegisterDeviceInput,
  type RegisterDeviceResult,
  type TripDto,
} from "@aptransit/shared";
import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import type { AuthenticatedUser } from "../../common/auth/auth.types";
import { Can } from "../../common/decorators/can.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { auditActorFromRequest } from "../audit/audit.service";
import { DriverService } from "./driver.service";

type Req = Request & { user?: AuthenticatedUser };

/** docs/06 Driver. DRIVER only (driver:trip). */
@Controller("driver")
@Can("driver:trip")
export class DriverController {
  constructor(private readonly driver: DriverService) {}

  @Post("devices")
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @HttpCode(HttpStatus.CREATED)
  registerDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(RegisterDeviceInput)) body: RegisterDeviceInput,
    @Req() req: Req,
  ): Promise<RegisterDeviceResult> {
    return this.driver.registerDevice(user.id, body.label, auditActorFromRequest(req));
  }

  @Get("today")
  today(@CurrentUser() user: AuthenticatedUser, @Headers("x-device-key") deviceKey: string | undefined): Promise<DriverTodayDto> {
    return this.driver.today(user.id, deviceKey);
  }

  @Get("trips")
  trips(@CurrentUser() user: AuthenticatedUser): Promise<DriverTripSummaryDto[]> {
    return this.driver.todaysTrips(user.id);
  }

  @Post("trips/:id/start")
  @HttpCode(HttpStatus.OK)
  start(@CurrentUser() user: AuthenticatedUser, @Param("id", new ZodValidationPipe(PublicId)) id: string, @Req() req: Req): Promise<TripDto> {
    return this.driver.startTrip(user.id, id, auditActorFromRequest(req));
  }

  @Post("trips/:id/end")
  @HttpCode(HttpStatus.OK)
  end(@CurrentUser() user: AuthenticatedUser, @Param("id", new ZodValidationPipe(PublicId)) id: string, @Req() req: Req): Promise<TripDto> {
    return this.driver.endTrip(user.id, id, auditActorFromRequest(req));
  }

  @Post("incidents")
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @HttpCode(HttpStatus.CREATED)
  incident(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(DriverIncidentInput)) body: DriverIncidentInput,
    @Req() req: Req,
  ): Promise<IncidentDto> {
    return this.driver.reportIncident(user.id, body, auditActorFromRequest(req));
  }
}
