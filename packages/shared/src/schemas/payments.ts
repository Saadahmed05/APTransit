import { z } from "zod";
import { Paise } from "../money";
import { PublicId } from "./search";

/** POST /payments/orders: exactly one of a booking or a pass. */
export const CreatePaymentOrderInput = z.union([
  z.object({ bookingId: PublicId }).strict(),
  z.object({ passId: PublicId }).strict(),
]);
export type CreatePaymentOrderInput = z.infer<typeof CreatePaymentOrderInput>;

export const PaymentOrderDto = z.object({
  orderId: z.string(),
  amountPaise: Paise,
  currency: z.literal("INR"),
  keyId: z.string(),
  prefill: z.object({
    name: z.string().nullable(),
    email: z.string().nullable(),
    contact: z.string().nullable(),
  }),
});
export type PaymentOrderDto = z.infer<typeof PaymentOrderDto>;

/** POST /payments/verify: the three values Razorpay checkout hands back. */
export const VerifyPaymentInput = z.object({
  razorpayOrderId: z.string().trim().min(1).max(64),
  razorpayPaymentId: z.string().trim().min(1).max(64),
  razorpaySignature: z.string().trim().regex(/^[0-9a-f]{64}$/, "Invalid signature"),
});
export type VerifyPaymentInput = z.infer<typeof VerifyPaymentInput>;

/** POST /payments/test/complete (dev and CI only). */
export const CompleteTestPaymentInput = z.object({
  orderId: z.string().trim().min(1).max(64),
});
export type CompleteTestPaymentInput = z.infer<typeof CompleteTestPaymentInput>;

export const PaymentKind = z.enum(["BOOKING", "PASS"]);
export type PaymentKind = z.infer<typeof PaymentKind>;

export const VerifyPaymentResult = z.object({
  kind: PaymentKind,
  bookingId: z.string().optional(),
  ticketIds: z.array(z.string()).optional(),
  passId: z.string().optional(),
});
export type VerifyPaymentResult = z.infer<typeof VerifyPaymentResult>;
