import { createHmac, timingSafeEqual } from "node:crypto";

export const PAYMENT_PROVIDER = "PAYMENT_PROVIDER";

export interface ProviderOrder {
  id: string;
  amountPaise: number;
  currency: string;
}

export type ProviderPaymentStatus = "created" | "authorized" | "captured" | "refunded" | "failed";

export interface ProviderPayment {
  id: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  status: ProviderPaymentStatus;
  /** Full provider payload, still unredacted. Pass it through redactPaymentPayload before storing. */
  raw: Record<string, unknown>;
}

export interface ProviderRefund {
  id: string;
  status: string;
}

/** Everything payments need from Razorpay. Tests use FakePaymentProvider. */
export interface PaymentProvider {
  readonly keyId: string;
  createOrder(input: { amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<ProviderOrder>;
  fetchPayment(paymentId: string): Promise<ProviderPayment>;
  capturePayment(paymentId: string, amountPaise: number): Promise<ProviderPayment>;
  verifyCheckoutSignature(input: { orderId: string; paymentId: string; signature: string }): boolean;
  verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean;
  createRefund(input: { paymentId: string; amountPaise: number; notes: Record<string, string> }): Promise<ProviderRefund>;
}

/** HMAC SHA 256 hex, as Razorpay signs checkout results and webhooks. */
export function hmacSha256Hex(secret: string, data: string | Buffer): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

/** Constant time comparison of two hex signatures. */
export function signaturesMatch(expectedHex: string, receivedHex: string | undefined): boolean {
  if (!receivedHex || !/^[0-9a-f]+$/i.test(receivedHex)) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const received = Buffer.from(receivedHex, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

// Card, VPA, bank and contact details never reach our database (docs/12, Payments).
const REDACTED_KEYS = new Set([
  "card",
  "card_id",
  "vpa",
  "upi",
  "bank",
  "wallet",
  "email",
  "contact",
  "token_id",
  "acquirer_data",
  "customer_id",
  "upi_transaction_id",
  "rrn",
]);

export function redactPaymentPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactPaymentPayload);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      out[key] = REDACTED_KEYS.has(key) ? "[redacted]" : redactPaymentPayload(inner);
    }
    return out;
  }
  return value;
}
