import {
  ComplaintDto,
  FeedbackCreatedDto,
  FeedbackInput,
  FeedbackStatusDto,
  FeedbackStatusQuery,
  OpsComplaintsQuery,
  PublicId,
  UpdateComplaintInput,
} from "@aptransit/shared";
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import type { AuthenticatedUser } from "../../common/auth/auth.types";
import { Can } from "../../common/decorators/can.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { RateLimitService } from "../../common/services/rate-limit.service";
import { auditActorFromRequest } from "../audit/audit.service";
import { FeedbackService } from "./feedback.service";

/** Language for a guest's email: the web locale cookie, else Accept-Language, else English. */
function requestLocale(req: Request): "en" | "te" {
  const cookie = /(?:^|;\s*)locale=(en|te)\b/.exec(req.headers.cookie ?? "")?.[1];
  if (cookie === "te" || cookie === "en") return cookie;
  return /^te\b/i.test(req.headers["accept-language"] ?? "") ? "te" : "en";
}

@Controller("feedback")
export class FeedbackController {
  constructor(
    private readonly feedback: FeedbackService,
    private readonly limits: RateLimitService,
  ) {}

  @Post()
  @Public()
  @HttpCode(201)
  async create(
    @Body(new ZodValidationPipe(FeedbackInput)) body: FeedbackInput,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<FeedbackCreatedDto> {
    await this.limits.assertFeedbackLimit(req.ip ?? "unknown", res);
    return FeedbackCreatedDto.parse(await this.feedback.create(body, user, requestLocale(req)));
  }

  @Get("mine")
  async mine(@CurrentUser() user: AuthenticatedUser): Promise<ComplaintDto[]> {
    return ComplaintDto.array().parse(await this.feedback.mine(user.id));
  }

  @Get("status")
  @Public()
  async status(
    @Query(new ZodValidationPipe(FeedbackStatusQuery)) query: FeedbackStatusQuery,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<FeedbackStatusDto> {
    await this.limits.assertFeedbackLookupLimit(req.ip ?? "unknown", res);
    return FeedbackStatusDto.parse(await this.feedback.status(query.code, query.email));
  }
}

@Controller("ops/complaints")
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class OpsComplaintsController {
  constructor(private readonly feedback: FeedbackService) {}

  @Get()
  @Can("complaint:manage")
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(OpsComplaintsQuery)) query: OpsComplaintsQuery,
  ): Promise<ComplaintDto[]> {
    return ComplaintDto.array().parse(await this.feedback.list(user, query.status, query.depotId));
  }

  @Patch(":id")
  @Can("complaint:manage")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ZodValidationPipe(PublicId)) id: string,
    @Body(new ZodValidationPipe(UpdateComplaintInput)) body: UpdateComplaintInput,
    @Req() req: Request,
  ): Promise<ComplaintDto> {
    return ComplaintDto.parse(await this.feedback.update(user, id, body, auditActorFromRequest(req)));
  }
}
