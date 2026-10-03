import { randomBytes } from "node:crypto";
import {
  hmacSha256Hex,
  type PaymentProvider,
  type ProviderOrder,
  type ProviderPayment,
  type ProviderPaymentStatus,
  type ProviderRefund,
  signaturesMatch,
} from "./payment-provider";

/**
 * In memory provider for tests (and the dev only test/complete endpoint on Day 7).
 * Signs exactly like Razorpay, with its own secrets.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly keyId = "rzp_test_fake";
  readonly keySecret = "fake-key-secret";
  readonly webhookSecret = "fake-webhook-secret";
  readonly orders = new Map<string, ProviderOrder & { receipt: string }>();
  readonly payments = new Map<string, ProviderPayment>();
  readonly refunds: { id: string; paymentId: string; amountPaise: number }[] = [];
  readonly captures: string[] = [];

  async createOrder(input: { amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<ProviderOrder> {
    const order = { id: `order_${randomBytes(7).toString("hex")}`, amountPaise: input.amountPaise, currency: "INR", receipt: input.receipt };
    this.orders.set(order.id, order);
    return { id: order.id, amountPaise: order.amountPaise, currency: order.currency };
  }

  /** What checkout would hand back after the user pays. */
  pay(
    orderId: string,
    options: { amountPaise?: number; status?: ProviderPaymentStatus } = {},
  ): { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string } {
    const order = this.orders.get(orderId);
    if (!order) throw new Error(`fake provider: unknown order ${orderId}`);
    const id = `pay_${randomBytes(7).toString("hex")}`;
    const amountPaise = options.amountPaise ?? order.amountPaise;
    const status = options.status ?? "captured";
    this.payments.set(id, {
      id,
      orderId,
      amountPaise,
      currency: "INR",
      status,
      raw: { id, order_id: orderId, amount: amountPaise, currency: "INR", status, method: "upi", vpa: "success@razorpay", email: "a@b.test", contact: "+919999999999" },
    });
    return { razorpayOrderId: orderId, razorpayPaymentId: id, razorpaySignature: hmacSha256Hex(this.keySecret, `${orderId}|${id}`) };
  }

  /** A signed webhook body for an event on a payment made with pay(). */
  webhook(event: "payment.captured" | "payment.failed", paymentId: string): { body: string; signature: string } {
    const payment = this.payments.get(paymentId);
    if (!payment) throw new Error(`fake provider: unknown payment ${paymentId}`);
    const body = JSON.stringify({ event, payload: { payment: { entity: { ...payment.raw, status: event === "payment.failed" ? "failed" : payment.status } } } });
    return { body, signature: hmacSha256Hex(this.webhookSecret, body) };
  }

  async fetchPayment(paymentId: string): Promise<ProviderPayment> {
    const payment = this.payments.get(paymentId);
    if (!payment) throw new Error(`fake provider: unknown payment ${paymentId}`);
    return { ...payment };
  }

  async capturePayment(paymentId: string, amountPaise: number): Promise<ProviderPayment> {
    const payment = this.payments.get(paymentId);
    if (!payment || payment.amountPaise !== amountPaise) throw new Error("fake provider: capture failed");
    payment.status = "captured";
    this.captures.push(paymentId);
    return { ...payment };
  }

  verifyCheckoutSignature({ orderId, paymentId, signature }: { orderId: string; paymentId: string; signature: string }): boolean {
    return signaturesMatch(hmacSha256Hex(this.keySecret, `${orderId}|${paymentId}`), signature);
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
    return signaturesMatch(hmacSha256Hex(this.webhookSecret, rawBody), signature);
  }

  async createRefund(input: { paymentId: string; amountPaise: number; notes: Record<string, string> }): Promise<ProviderRefund> {
    const refund = { id: `rfnd_${randomBytes(7).toString("hex")}`, paymentId: input.paymentId, amountPaise: input.amountPaise };
    this.refunds.push(refund);
    return { id: refund.id, status: "processed" };
  }
}
