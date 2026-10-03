import {
  type CancelTicketResult,
  PublicId,
  type RefundQuoteDto,
  type TicketDto,
  type TicketQrDto,
  TicketsQuery,
  type TicketSummaryDto,
} from "@aptransit/shared";
import { Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import type { AuthenticatedUser } from "../../common/auth/auth.types";
import { Can } from "../../common/decorators/can.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { auditActorFromRequest } from "../audit/audit.service";
import { TicketsService } from "./tickets.service";

/** docs/06 Tickets. Holder only: the service loads tickets by id and holder together. */
@Controller("tickets")
@Can("ticket:own")
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(TicketsQuery)) query: TicketsQuery,
  ): Promise<TicketSummaryDto[]> {
    return this.tickets.list(user.id, query.scope);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthenticatedUser, @Param("id", new ZodValidationPipe(PublicId)) id: string): Promise<TicketDto> {
    return this.tickets.get(user.id, id);
  }

  @Get(":id/qr")
  qr(@CurrentUser() user: AuthenticatedUser, @Param("id", new ZodValidationPipe(PublicId)) id: string): Promise<TicketQrDto> {
    return this.tickets.qrFor(user.id, id);
  }

  @Get(":id/refund-quote")
  refundQuote(@CurrentUser() user: AuthenticatedUser, @Param("id", new ZodValidationPipe(PublicId)) id: string): Promise<RefundQuoteDto> {
    return this.tickets.refundQuote(user.id, id);
  }

  @Post(":id/activate")
  @HttpCode(HttpStatus.OK)
  activate(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ZodValidationPipe(PublicId)) id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() req: Request & { user?: AuthenticatedUser },
  ): Promise<TicketDto> {
    return this.tickets.activate(user.id, id, idempotencyKey, auditActorFromRequest(req));
  }

  @Post(":id/cancel")
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ZodValidationPipe(PublicId)) id: string,
    @Req() req: Request & { user?: AuthenticatedUser },
  ): Promise<CancelTicketResult> {
    return this.tickets.cancel(user.id, id, auditActorFromRequest(req));
  }
}
