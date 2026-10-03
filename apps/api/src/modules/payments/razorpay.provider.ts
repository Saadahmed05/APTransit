import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Razorpay from "razorpay";
import { AppError } from "../../common/errors/app-error";
import type { Env } from "../../config/env";
import {
  hmacSha256Hex,
  type PaymentProvider,
  type ProviderOrder,
  type ProviderPayment,
  type ProviderPaymentStatus,
  type ProviderRefund,
  signaturesMatch,
} from "./payment-provider";

interface RazorpayPaymentLike {
  id: string;
  order_id?: string | null;
  amount: number | string;
  currency: string;
  status: string;
}

function toPayment(entity: RazorpayPaymentLike): ProviderPayment {
  return {
    id: entity.id,
    orderId: entity.order_id ?? "",
    amountPaise: Number(entity.amount),
    currency: entity.currency,
    status: entity.status as ProviderPaymentStatus,
    raw: entity as unknown as Record<string, unknown>,
  };
}

/** Razorpay test mode (docs/12: only rzp_test_ keys boot). Signatures checked with Node crypto. */
@Injectable()
export class RazorpayProvider implements PaymentProvider {
  readonly keyId: string;
  private readonly keySecret: string;
  private readonly webhookSecret: string;
  private readonly client: Razorpay;

  constructor(config: ConfigService<Env, true>) {
    this.keyId = config.get("RAZORPAY_KEY_ID", { infer: true });
    this.keySecret = config.get("RAZORPAY_KEY_SECRET", { infer: true });
    this.webhookSecret = config.get("RAZORPAY_WEBHOOK_SECRET", { infer: true });
    this.client = new Razorpay({ key_id: this.keyId, key_secret: this.keySecret });
  }

  async createOrder(input: { amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<ProviderOrder> {
    const order = await this.call(() =>
      this.client.orders.create({ amount: input.amountPaise, currency: "INR", receipt: input.receipt, notes: input.notes }),
    );
    return { id: order.id, amountPaise: Number(order.amount), currency: order.currency };
  }

  async fetchPayment(paymentId: string): Promise<ProviderPayment> {
    return toPayment(await this.call(() => this.client.payments.fetch(paymentId)));
  }

  async capturePayment(paymentId: string, amountPaise: number): Promise<ProviderPayment> {
    return toPayment(await this.call(() => this.client.payments.capture(paymentId, amountPaise, "INR")));
  }

  verifyCheckoutSignature({ orderId, paymentId, signature }: { orderId: string; paymentId: string; signature: string }): boolean {
    return signaturesMatch(hmacSha256Hex(this.keySecret, `${orderId}|${paymentId}`), signature);
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
    return signaturesMatch(hmacSha256Hex(this.webhookSecret, rawBody), signature);
  }

  async createRefund(input: { paymentId: string; amountPaise: number; notes: Record<string, string> }): Promise<ProviderRefund> {
    const refund = await this.call(() =>
      this.client.payments.refund(input.paymentId, { amount: input.amountPaise, notes: input.notes }),
    );
    return { id: refund.id, status: refund.status };
  }

  /** Provider errors never leak their payload (it can hold card or VPA details). */
  private async call<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      throw new AppError("INTERNAL", `Payment provider request failed${status ? ` (${status})` : ""}`);
    }
  }
}
