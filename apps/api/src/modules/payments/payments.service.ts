import { randomBytes } from "node:crypto";
import type { CreatePaymentOrderInput, PaymentOrderDto, VerifyPaymentInput, VerifyPaymentResult } from "@aptransit/shared";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { AppError } from "../../common/errors/app-error";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { idempotencySlot, readIdempotent, writeIdempotent } from "../../common/services/idempotency";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { RedisService } from "../../redis/redis.service";
import { AuditService, type LogAuditParams } from "../audit/audit.service";
import { PASS_PAYMENT_ABANDON_MINUTES } from "../passes/pass-rules";
import { BookingConfirmationService } from "./booking-confirmation.service";
import { PassConfirmationService } from "./pass-confirmation.service";
import { PAYMENT_PROVIDER, type PaymentProvider, type ProviderPayment, redactPaymentPayload } from "./payment-provider";

type AuditActor = Pick<LogAuditParams, "actorUserId" | "actorRole" | "ip" | "userAgent">;

interface WebhookRefundEntity {
  id?: string;
  payment_id?: string;
  amount?: number;
  status?: string;
}

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
    private readonly passConfirmation: PassConfirmationService,
    private readonly events: DomainEventsService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /** POST /payments/orders. The amount is always the booking total or pass price from our database. */
  async createOrder(userId: string, input: CreatePaymentOrderInput, now = new Date()): Promise<PaymentOrderDto> {
    if ("passId" in input) return this.createPassOrder(userId, input.passId, now);
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

  /** Order for a PENDING_PAYMENT pass. The price is the one copied onto the pass at purchase (D-036), never from the client. */
  private async createPassOrder(userId: string, passId: string, now: Date): Promise<PaymentOrderDto> {
    const pass = await this.prisma.pass.findUnique({
      where: { id: passId },
      include: { user: { select: { name: true, email: true, phone: true } } },
    });
    if (!pass || pass.userId !== userId) throw new AppError("NOT_FOUND", "Pass not found");
    const abandoned = now.getTime() - pass.createdAt.getTime() > PASS_PAYMENT_ABANDON_MINUTES * 60_000;
    if (pass.status !== "PENDING_PAYMENT" || abandoned || pass.pricePaise <= 0) {
      throw new AppError("BOOKING_NOT_PAYABLE", "This pass cannot be paid");
    }

    const amountPaise = pass.pricePaise;
    let payment = await this.prisma.payment.findFirst({
      where: { passId: pass.id, status: "CREATED", amountPaise },
      orderBy: { createdAt: "desc" },
    });
    if (!payment) {
      const order = await this.provider.createOrder({ amountPaise, receipt: pass.code, notes: { passId: pass.id } });
      payment = await this.prisma.payment.create({
        data: { passId: pass.id, provider: "RAZORPAY", providerOrderId: order.id, amountPaise, status: "CREATED" },
      });
    }
    return {
      orderId: payment.providerOrderId,
      amountPaise: payment.amountPaise,
      currency: "INR",
      keyId: this.provider.keyId,
      prefill: { name: pass.user.name, email: pass.user.email, contact: pass.user.phone },
    };
  }

  /** The user who owns the booking or the pass behind a payment row. */
  private async paymentOwner(payment: { passId: string | null; booking?: { userId: string } | null }): Promise<string | null> {
    if (payment.booking) return payment.booking.userId;
    if (!payment.passId) return null;
    const pass = await this.prisma.pass.findUnique({ where: { id: payment.passId }, select: { userId: true } });
    return pass?.userId ?? null;
  }

  /** Booking payments make tickets, pass payments make the pass READY. Never both. */
  private async confirmPayment(payment: { id: string; passId: string | null }, providerPayment: ProviderPayment): Promise<VerifyPaymentResult> {
    if (payment.passId) {
      const outcome = await this.passConfirmation.confirmPass(payment.id, providerPayment);
      if (outcome.outcome === "REFUNDED") {
        throw new AppError("BOOKING_NOT_PAYABLE", "This pass can no longer be paid. The full amount is refunded");
      }
      return { kind: "PASS", passId: outcome.passId };
    }
    const outcome = await this.confirmation.confirmBooking(payment.id, providerPayment);
    if (outcome.outcome === "REFUNDED") {
      throw new AppError("HOLD_EXPIRED", "The seat hold expired before the payment arrived. The full amount is refunded");
    }
    return { kind: "BOOKING", bookingId: outcome.bookingId, ticketIds: outcome.ticketIds };
  }

  /** POST /payments/verify: signature, then the provider's own record, then confirmBooking or confirmPass. */
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
    if (!payment || (await this.paymentOwner(payment)) !== userId) {
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
      result = await this.confirmPayment(payment, providerPayment);
    } catch (err) {
      await this.audit.log({ ...auditBase, after: { result: err instanceof AppError ? err.code : "INTERNAL" } });
      throw err;
    }

    await this.audit.log({ ...auditBase, after: { result: "CONFIRMED", kind: result.kind, ticketIds: result.ticketIds, passId: result.passId } });
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
    let refundEntity: WebhookRefundEntity | undefined;
    try {
      const body = JSON.parse(rawBody.toString("utf8")) as {
        event?: string;
        payload?: { payment?: { entity?: WebhookPaymentEntity }; refund?: { entity?: WebhookRefundEntity } };
      };
      event = body.event;
      entity = body.payload?.payment?.entity;
      refundEntity = body.payload?.refund?.entity;
    } catch {
      throw new AppError("VALIDATION_FAILED", "Webhook body is not JSON");
    }

    if (event === "refund.processed") {
      await this.refundProcessed(refundEntity);
      return;
    }

    if ((event !== "payment.captured" && event !== "payment.failed") || !entity?.order_id || !entity.id) {
      return; // everything else is not ours
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
        outcome = payment.passId
          ? (await this.passConfirmation.confirmPass(payment.id, providerPayment)).outcome
          : (await this.confirmation.confirmBooking(payment.id, providerPayment)).outcome;
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

  /**
   * POST /payments/test/complete (dev and CI only): a captured payment for the caller's open order,
   * through the same confirmBooking as a real one. Never touches Razorpay.
   */
  async completeTestPayment(userId: string, orderId: string, actor: AuditActor): Promise<VerifyPaymentResult> {
    const payment = await this.prisma.payment.findUnique({
      where: { providerOrderId: orderId },
      include: { booking: { select: { userId: true } } },
    });
    if (!payment || (await this.paymentOwner(payment)) !== userId) {
      throw new AppError("NOT_FOUND", "Payment not found");
    }
    const fakeId = `pay_test_${randomBytes(7).toString("hex")}`;
    try {
      const result = await this.confirmPayment(payment, {
        id: fakeId,
        orderId,
        amountPaise: payment.amountPaise,
        currency: "INR",
        status: "captured",
        raw: { id: fakeId, order_id: orderId, amount: payment.amountPaise, method: "test" },
      });
      await this.audit.log({ action: "payment.verify", entityType: "payment", entityId: payment.id, after: { result: "CONFIRMED", kind: result.kind, fake: true }, ...actor });
      return result;
    } catch (err) {
      await this.audit.log({ action: "payment.verify", entityType: "payment", entityId: payment.id, after: { result: err instanceof AppError ? err.code : "INTERNAL", fake: true }, ...actor });
      throw err;
    }
  }

  /**
   * refund.processed: refund PROCESSED, its ticket CANCELLED to REFUNDED, and the payment REFUNDED
   * or PARTIALLY_REFUNDED by what has gone back so far. Safe to receive twice.
   */
  private async refundProcessed(entity: WebhookRefundEntity | undefined): Promise<void> {
    if (!entity?.id) return;
    const refund = await this.prisma.refund.findUnique({ where: { providerRefundId: entity.id } });
    if (!refund) return;

    const changed = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.refund.updateMany({
        where: { id: refund.id, status: { not: "PROCESSED" } },
        data: { status: "PROCESSED", processedAt: new Date() },
      });
      if (count === 0) return null;
      const payment = await tx.payment.findUnique({ where: { id: refund.paymentId }, include: { refunds: { select: { amountPaise: true, status: true } } } });
      if (payment) {
        const back = payment.refunds.filter((r) => r.status === "PROCESSED").reduce((sum, r) => sum + r.amountPaise, 0);
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: back >= payment.amountPaise ? "REFUNDED" : "PARTIALLY_REFUNDED" },
        });
      }
      if (!refund.ticketId) return { ticket: null };
      const ticket = await tx.ticket.findUnique({ where: { id: refund.ticketId }, select: { id: true, holderUserId: true, status: true } });
      if (!ticket || !(ticket.status === "CANCELLED" ||
        (refund.reason === "OPERATOR_CANCELLED" && ["BOOKED", "ACTIVE"].includes(ticket.status)))) return { ticket: null };
      await tx.ticket.update({ where: { id: ticket.id }, data: { status: "REFUNDED", version: { increment: 1 } } });
      return { ticket };
    });

    if (changed?.ticket) {
      this.events.publish("ticket.status", { ticketId: changed.ticket.id, holderUserId: changed.ticket.holderUserId, from: changed.ticket.status, to: "REFUNDED" });
    }
    await this.audit.log({ action: "payment.webhook", entityType: "refund", entityId: refund.id, after: { event: "refund.processed", result: changed ? "PROCESSED" : "IGNORED" } });
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
