import { CompleteTestPaymentInput, type VerifyPaymentResult } from "@aptransit/shared";
import { Body, Controller, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import type { AuthenticatedUser } from "../../common/auth/auth.types";
import { Can } from "../../common/decorators/can.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { auditActorFromRequest } from "../audit/audit.service";
import { PaymentsService } from "./payments.service";

/** Dev and CI only (registered by PaymentsTestModule). Lets e2e tests pay without the Razorpay popup. */
@Controller("payments/test")
export class PaymentsTestController {
  constructor(private readonly payments: PaymentsService) {}

  @Post("complete")
  @Can("booking:create")
  @Throttle({ default: { limit: 20, ttl: 600_000 } })
  @HttpCode(HttpStatus.OK)
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CompleteTestPaymentInput)) body: CompleteTestPaymentInput,
    @Req() req: Request & { user?: AuthenticatedUser },
  ): Promise<VerifyPaymentResult> {
    return this.payments.completeTestPayment(user.id, body.orderId, auditActorFromRequest(req));
  }
}
