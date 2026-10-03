import {
  CreatePaymentOrderInput,
  type PaymentOrderDto,
  VerifyPaymentInput,
  type VerifyPaymentResult,
} from "@aptransit/shared";
import { Body, Controller, Headers, HttpCode, HttpStatus, Post, type RawBodyRequest, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import type { AuthenticatedUser } from "../../common/auth/auth.types";
import { Can } from "../../common/decorators/can.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { auditActorFromRequest } from "../audit/audit.service";
import { PaymentsService } from "./payments.service";

// docs/12: POST /payments/* 20 per user per 10 min
const PAYMENT_LIMIT = { default: { limit: 20, ttl: 600_000 } };

@Controller("payments")
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post("orders")
  @Can("booking:create")
  @Throttle(PAYMENT_LIMIT)
  @HttpCode(HttpStatus.OK)
  createOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreatePaymentOrderInput)) body: CreatePaymentOrderInput,
  ): Promise<PaymentOrderDto> {
    return this.payments.createOrder(user.id, body);
  }

  @Post("verify")
  @Can("booking:create")
  @Throttle(PAYMENT_LIMIT)
  @HttpCode(HttpStatus.OK)
  verify(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(VerifyPaymentInput)) body: VerifyPaymentInput,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() req: Request & { user?: AuthenticatedUser },
  ): Promise<VerifyPaymentResult> {
    return this.payments.verify(user.id, body, idempotencyKey, auditActorFromRequest(req));
  }

  /** Razorpay calls this. Authenticated by X-Razorpay-Signature over the raw body, not by a token. */
  @Public()
  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers("x-razorpay-signature") signature: string | undefined,
  ): Promise<{ received: true }> {
    await this.payments.handleWebhook(req.rawBody, signature);
    return { received: true };
  }
}
