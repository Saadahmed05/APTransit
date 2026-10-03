import type { CreatePaymentOrderInput, PaymentOrderDto, VerifyPaymentInput, VerifyPaymentResult } from "@aptransit/shared";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { AppError } from "../../common/errors/app-error";
import { idempotencySlot, readIdempotent, writeIdempotent } from "../../common/services/idempotency";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { RedisService } from "../../redis/redis.service";
import { AuditService, type LogAuditParams } from "../audit/audit.service";
import { BookingConfirmationService } from "./booking-confirmation.service";
import { PAYMENT_PROVIDER, type PaymentProvider, type ProviderPayment, redactPaymentPayload } from "./payment-provider";

type AuditActor = Pick<LogAuditParams, "actorUserId" | "actorRole" | "ip" | "userAgent">;

interface WebhookPaymentEntity {
  id?: string;
  order_id?: string;
  amount?: number;
  currency?: string;
  status?: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly confirmation: BookingConfirmationService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /** POST /payments/orders. The amount is always the booking total from our database. */
  async createOrder(userId: string, input: CreatePaymentOrderInput, now = new Date()): Promise<PaymentOrderDto> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: input.bookingId },
      include: { user: { select: { name: true, email: true, phone: true } } },
    });
    if (!booking || booking.userId !== userId) {
      throw new AppError("NOT_FOUND", "Booking not found");
    }
    if (booking.status !== "PENDING_PAYMENT") {
      throw new AppError("BOOKING_NOT_PAYABLE", "This booking cannot be paid");
    }
    if (booking.holdExpiresAt.getTime() <= now.getTime()) {
      throw new AppError("HOLD_EXPIRED", "The seat hold has expired");
    }

    // Reuse the open order, so a retried Pay never creates a second order for one booking
    let payment = await this.prisma.payment.findFirst({
      where: { bookingId: booking.id, status: "CREATED", amountPaise: booking.totalPaise },
      orderBy: { createdAt: "desc" },
    });
    if (!payment) {
      const order = await this.provider.createOrder({
        amountPaise: booking.totalPaise,
        receipt: booking.code,
        notes: { bookingId: booking.id },
      });
      payment = await this.prisma.payment.create({
        data: {
          bookingId: booking.id,
          provider: "RAZORPAY",
          providerOrderId: order.id,
          amountPaise: booking.totalPaise,
          status: "CREATED",
        },
      });
    }

    return {
      orderId: payment.providerOrderId,
      amountPaise: payment.amountPaise,
      currency: "INR",
      keyId: this.provider.keyId,
      prefill: { name: booking.user.name, email: booking.user.email, contact: booking.user.phone },
    };
  }

  /** POST /payments/verify: signature, then the provider's own record, then confirmBooking. */
  async verify(
    userId: string,
    input: VerifyPaymentInput,
    idempotencyKey: string | undefined,
    actor: AuditActor,
  ): Promise<VerifyPaymentResult> {
    const slot = idempotencySlot("payment-verify", userId, idempotencyKey, input);
    const cached = await readIdempotent<VerifyPaymentResult>(this.redis.client, slot);
    if (cached) return cached;

    const payment = await this.prisma.payment.findUnique({
      where: { providerOrderId: input.razorpayOrderId },
      include: { booking: { select: { userId: true } } },
    });
    if (!payment?.booking || payment.booking.userId !== userId) {
      throw new AppError("NOT_FOUND", "Payment not found");
    }

    const auditBase = { action: "payment.verify", entityType: "payment", entityId: payment.id, ...actor };
    const signed = this.provider.verifyCheckoutSignature({
      orderId: input.razorpayOrderId,
      paymentId: input.razorpayPaymentId,
      signature: input.razorpaySignature,
    });
    if (!signed) {
      await this.audit.log({ ...auditBase, after: { result: "PAYMENT_SIGNATURE_INVALID" } });
      throw new AppError("PAYMENT_SIGNATURE_INVALID", "Payment signature is not valid");
    }

    let result: VerifyPaymentResult;
    try {
      const providerPayment = await this.checkedProviderPayment(payment, await this.provider.fetchPayment(input.razorpayPaymentId));
      const outcome = await this.confirmation.confirmBooking(payment.id, providerPayment);
      if (outcome.outcome === "REFUNDED") {
        throw new AppError("HOLD_EXPIRED", "The seat hold expired before the payment arrived. The full amount is refunded");
      }
      result = { kind: "BOOKING", bookingId: outcome.bookingId, ticketIds: outcome.ticketIds };
    } catch (err) {
      await this.audit.log({ ...auditBase, after: { result: err instanceof AppError ? err.code : "INTERNAL" } });
      throw err;
    }

    await this.audit.log({ ...auditBase, after: { result: "CONFIRMED", ticketIds: result.ticketIds } });
    await writeIdempotent(this.redis.client, slot, result);
    return result;
  }

  /**
   * POST /payments/webhook. Signature over the raw body first; then payment.captured confirms
   * through the same confirmBooking, payment.failed marks the payment FAILED. Unknown events
   * are ignored. Only a bad signature is an error, so Razorpay does not retry good deliveries.
   */
  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined): Promise<void> {
    if (!rawBody || !this.provider.verifyWebhookSignature(rawBody, signature)) {
      await this.audit.log({ action: "payment.webhook", entityType: "payment", entityId: "unknown", after: { result: "SIGNATURE_INVALID" } });
      throw new AppError("VALIDATION_FAILED", "Webhook signature is not valid");
    }

    let event: string | undefined;
    let entity: WebhookPaymentEntity | undefined;
    try {
      const body = JSON.parse(rawBody.toString("utf8")) as {
        event?: string;
        payload?: { payment?: { entity?: WebhookPaymentEntity } };
      };
      event = body.event;
      entity = body.payload?.payment?.entity;
    } catch {
      throw new AppError("VALIDATION_FAILED", "Webhook body is not JSON");
    }

    if ((event !== "payment.captured" && event !== "payment.failed") || !entity?.order_id || !entity.id) {
      return; // refund.processed arrives on Day 7; everything else is not ours
    }

    const payment = await this.prisma.payment.findUnique({
      where: { providerOrderId: entity.order_id },
      include: { booking: { select: { userId: true } } },
    });
    if (!payment) return;

    let outcome = "IGNORED";
    try {
      if (event === "payment.failed") {
        const { count } = await this.prisma.payment.updateMany({
          where: { id: payment.id, status: "CREATED" },
          data: { status: "FAILED", raw: redactPaymentPayload(entity) as Prisma.InputJsonValue },
        });
        outcome = count === 1 ? "FAILED" : "IGNORED";
      } else {
        const providerPayment = await this.checkedProviderPayment(payment, {
          id: entity.id,
          orderId: entity.order_id,
          amountPaise: Number(entity.amount),
          currency: entity.currency ?? "",
          status: "captured",
          raw: entity as Record<string, unknown>,
        });
        outcome = (await this.confirmation.confirmBooking(payment.id, providerPayment)).outcome;
      }
    } catch (err) {
      // Still 200: a retry would hit the same check. The audit row keeps the reason.
      outcome = err instanceof AppError ? err.code : "INTERNAL";
      this.logger.warn(`Webhook ${event} for payment ${payment.id} not applied: ${outcome}`);
    }

    await this.audit.log({
      action: "payment.webhook",
      entityType: "payment",
      entityId: payment.id,
      after: { event, result: outcome },
    });
  }

  /** The provider's record must match our order and amount, and the money must be captured. */
  private async checkedProviderPayment(
    payment: { providerOrderId: string; amountPaise: number },
    providerPayment: ProviderPayment,
  ): Promise<ProviderPayment> {
    if (providerPayment.orderId !== payment.providerOrderId) {
      throw new AppError("PAYMENT_SIGNATURE_INVALID", "Payment does not belong to this order");
    }
    if (providerPayment.amountPaise !== payment.amountPaise || providerPayment.currency !== "INR") {
      throw new AppError("PAYMENT_AMOUNT_MISMATCH", "Paid amount does not match the booking total");
    }
    if (providerPayment.status === "authorized") {
      return this.provider.capturePayment(providerPayment.id, payment.amountPaise);
    }
    if (providerPayment.status !== "captured") {
      throw new AppError("BOOKING_NOT_PAYABLE", "The payment was not completed");
    }
    return providerPayment;
  }
}
