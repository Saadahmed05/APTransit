import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { PAYMENT_PROVIDER, type PaymentProvider, type ProviderPayment, redactPaymentPayload } from "./payment-provider";

export type PassConfirmResult = { outcome: "CONFIRMED"; passId: string } | { outcome: "REFUNDED"; passId: string };

const REFUND_REASON_PASS = "PASS_NOT_PAYABLE";

/**
 * The only code that makes a paid pass READY (docs/06: after the HMAC and amount checks).
 * Idempotent like confirmBooking: moving the payment out of CREATED or FAILED is the claim.
 */
@Injectable()
export class PassConfirmationService {
  private readonly logger = new Logger(PassConfirmationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  async confirmPass(paymentRowId: string, providerPayment: ProviderPayment, now = new Date()): Promise<PassConfirmResult> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentRowId }, include: { refunds: { select: { id: true } } } });
    if (!payment?.passId) throw new Error(`confirmPass: payment ${paymentRowId} has no pass`);
    const passId = payment.passId;

    if (payment.status !== "CREATED" && payment.status !== "FAILED") {
      return { outcome: payment.refunds.length > 0 ? "REFUNDED" : "CONFIRMED", passId };
    }

    const outcome = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, status: { in: ["CREATED", "FAILED"] } },
        data: {
          status: "CAPTURED",
          providerPaymentId: providerPayment.id,
          capturedAt: now,
          raw: redactPaymentPayload(providerPayment.raw) as Prisma.InputJsonValue,
        },
      });
      if (claimed.count !== 1) return "LOST" as const;
      const ready = await tx.pass.updateMany({
        where: { id: passId, status: "PENDING_PAYMENT" },
        data: { status: "READY", paymentId: payment.id },
      });
      return ready.count === 1 ? ("CONFIRMED" as const) : ("NOT_PAYABLE" as const);
    });

    if (outcome === "LOST") {
      const fresh = await this.prisma.payment.findUnique({ where: { id: payment.id }, include: { refunds: { select: { id: true } } } });
      return { outcome: fresh && fresh.refunds.length > 0 ? "REFUNDED" : "CONFIRMED", passId };
    }
    if (outcome === "CONFIRMED") return { outcome, passId };

    // Money arrived for a pass that was abandoned (CANCELLED) or already paid: give it all back
    await this.refundAll(payment.id, passId, providerPayment);
    return { outcome: "REFUNDED", passId };
  }

  private async refundAll(paymentRowId: string, passId: string, providerPayment: ProviderPayment): Promise<void> {
    let providerRefund: { id: string; status: string } | null = null;
    try {
      providerRefund = await this.provider.createRefund({
        paymentId: providerPayment.id,
        amountPaise: providerPayment.amountPaise,
        notes: { passId, reason: REFUND_REASON_PASS },
      });
    } catch (err) {
      this.logger.error(`Refund for pass payment ${paymentRowId} failed, needs an operator: ${(err as Error).message}`);
    }
    const policy =
      (await this.prisma.refundPolicy.findFirst({ where: { isActive: true }, orderBy: { validFrom: "desc" } })) ??
      (await this.prisma.refundPolicy.findFirst({ orderBy: { validFrom: "desc" } }));
    if (!policy) {
      this.logger.error(`No refund policy, refund row for pass payment ${paymentRowId} not written`);
      return;
    }
    const refund = await this.prisma.refund.create({
      data: {
        paymentId: paymentRowId,
        amountPaise: providerPayment.amountPaise,
        status: providerRefund ? (providerRefund.status === "processed" ? "PROCESSED" : "PENDING") : "FAILED",
        providerRefundId: providerRefund?.id ?? null,
        processedAt: providerRefund?.status === "processed" ? new Date() : null,
        policyId: policy.id,
        reason: REFUND_REASON_PASS,
      },
    });
    await this.audit.log({
      action: "refund.create",
      entityType: "refund",
      entityId: refund.id,
      after: { paymentId: paymentRowId, passId, amountPaise: providerPayment.amountPaise, reason: REFUND_REASON_PASS, status: refund.status },
    });
  }
}
