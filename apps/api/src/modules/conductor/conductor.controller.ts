import {
  ConductorAlightingDto,
  ConductorManifestDto,
  ConductorTodayDto,
  PublicId,
  ValidateTicketInput,
  ValidateTicketResult,
} from "@aptransit/shared";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import type { AuthenticatedUser } from "../../common/auth/auth.types";
import { Can } from "../../common/decorators/can.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { auditActorFromRequest } from "../audit/audit.service";
import { DriverService } from "../driver/driver.service";
import { ConductorService } from "./conductor.service";
import { ValidateService } from "./validate.service";

@Controller("conductor")
@Can("conductor:manifest")
export class ConductorController {
  constructor(private readonly conductor: ConductorService) {}
  @Get("today")
  async today(@CurrentUser() user: AuthenticatedUser) {
    return ConductorTodayDto.parse(await this.conductor.today(user.id));
  }
  @Get("trips/:id/manifest")
  async manifest(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ZodValidationPipe(PublicId)) id: string,
  ) {
    return ConductorManifestDto.parse(await this.conductor.manifest(user.id, id));
  }
  @Get("trips/:id/alighting")
  async alighting(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ZodValidationPipe(PublicId)) id: string,
  ) {
    return ConductorAlightingDto.parse(await this.conductor.alighting(user.id, id));
  }
}

/** D-048: the conductor raises an SOS on the trip (CRITICAL incident, same as a driver incident). */
@Controller("conductor")
@Can("conductor:manifest")
export class ConductorSosController {
  constructor(private readonly driver: DriverService) {}
  @Post("sos")
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @HttpCode(HttpStatus.CREATED)
  sos(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.driver.reportConductorSos(user.id, auditActorFromRequest(req));
  }
}

@Controller("tickets")
export class ValidateController {
  constructor(private readonly validator: ValidateService) {}
  @Post("validate")
  @HttpCode(200)
  @Can("ticket:validate")
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async validate(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(ValidateTicketInput)) body: ValidateTicketInput,
    @Req() req: Request,
  ) {
    return ValidateTicketResult.parse(
      await this.validator.validateAsConductor(user.id, body, auditActorFromRequest(req)),
    );
  }
}
