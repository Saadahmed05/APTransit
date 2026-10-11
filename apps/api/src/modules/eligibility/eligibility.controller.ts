import { type EligibilityCheckDto, type EligibilityStatusDto, StreeShaktiCheckInput, StudentCheckInput } from "@aptransit/shared";
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import type { AuthenticatedUser } from "../../common/auth/auth.types";
import { Can } from "../../common/decorators/can.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { auditActorFromRequest } from "../audit/audit.service";
import { EligibilityService } from "./eligibility.service";

@Controller("eligibility")
@Can("pass:own")
export class EligibilityController {
  constructor(private readonly eligibility: EligibilityService) {}

  /** The strict schema refuses any extra key, so an ID number never reaches the service. */
  @Post("stree-shakti")
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @HttpCode(HttpStatus.OK)
  check(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(StreeShaktiCheckInput)) body: StreeShaktiCheckInput,
    @Req() req: Request & { user?: AuthenticatedUser },
  ): Promise<EligibilityCheckDto> {
    return this.eligibility.checkStreeShakti(user.id, body, auditActorFromRequest(req));
  }

  /** D-036 school pass. Strict schema: no student ID number can reach the service. */
  @Post("student")
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @HttpCode(HttpStatus.OK)
  student(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(StudentCheckInput)) body: StudentCheckInput,
    @Req() req: Request & { user?: AuthenticatedUser },
  ): Promise<EligibilityCheckDto> {
    return this.eligibility.checkStudent(user.id, body, auditActorFromRequest(req));
  }

  @Get()
  latest(@CurrentUser() user: AuthenticatedUser): Promise<EligibilityStatusDto> {
    return this.eligibility.latest(user.id);
  }
}
