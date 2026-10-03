import { z } from "zod";
import { Paise } from "../money";
import { PublicId } from "./search";

/** POST /payments/orders. `passId` arrives with passes on Day 8. */
export const CreatePaymentOrderInput = z.object({
  bookingId: PublicId,
});
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

export const PaymentKind = z.enum(["BOOKING", "PASS"]);
export type PaymentKind = z.infer<typeof PaymentKind>;

export const VerifyPaymentResult = z.object({
  kind: PaymentKind,
  bookingId: z.string().optional(),
  ticketIds: z.array(z.string()).optional(),
  passId: z.string().optional(),
});
export type VerifyPaymentResult = z.infer<typeof VerifyPaymentResult>;
