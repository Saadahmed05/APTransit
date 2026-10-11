import { z } from "zod";

// Stable error codes from docs/06-api-contract.md. The web shows t(`errors.${code}`), never the message.

export const ErrorCode = {
  VALIDATION_FAILED: "VALIDATION_FAILED",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  RATE_LIMITED: "RATE_LIMITED",
  OTP_INVALID: "OTP_INVALID",
  OTP_EXPIRED: "OTP_EXPIRED",
  OTP_TOO_MANY_ATTEMPTS: "OTP_TOO_MANY_ATTEMPTS",
  SEAT_TAKEN: "SEAT_TAKEN",
  HOLD_EXPIRED: "HOLD_EXPIRED",
  BOOKING_NOT_PAYABLE: "BOOKING_NOT_PAYABLE",
  PAYMENT_SIGNATURE_INVALID: "PAYMENT_SIGNATURE_INVALID",
  PAYMENT_AMOUNT_MISMATCH: "PAYMENT_AMOUNT_MISMATCH",
  TICKET_NOT_ACTIVATABLE: "TICKET_NOT_ACTIVATABLE",
  TICKET_ALREADY_ACTIVE: "TICKET_ALREADY_ACTIVE",
  ACTIVATION_WINDOW_CLOSED: "ACTIVATION_WINDOW_CLOSED",
  TICKET_NOT_CANCELLABLE: "TICKET_NOT_CANCELLABLE",
  TICKET_NOT_GIFTABLE: "TICKET_NOT_GIFTABLE",
  RECIPIENT_NOT_FOUND: "RECIPIENT_NOT_FOUND",
  GIFT_TO_SELF: "GIFT_TO_SELF",
  PASS_NOT_ELIGIBLE: "PASS_NOT_ELIGIBLE",
  PASS_ALREADY_ACTIVE: "PASS_ALREADY_ACTIVE",
  ELIGIBILITY_REQUIRED: "ELIGIBILITY_REQUIRED",
  DEVICE_NOT_APPROVED: "DEVICE_NOT_APPROVED",
  TRIP_NOT_ASSIGNED: "TRIP_NOT_ASSIGNED",
  TRIP_NOT_STARTABLE: "TRIP_NOT_STARTABLE",
  BUS_NOT_AVAILABLE: "BUS_NOT_AVAILABLE",
  COMPLAINT_STATUS_INVALID: "COMPLAINT_STATUS_INVALID",
  EMAIL_DELIVERY_FAILED: "EMAIL_DELIVERY_FAILED",
  INTERNAL: "INTERNAL",
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * HTTP status per code, following the rules in docs/06:
 * 400 validation, 401 no or bad token, 403 role or scope, 404 not found,
 * 409 state conflict, 410 expired, 422 business rule, 429 rate limit, 500 server,
 * 503 an outside service (email) is unavailable, try again later.
 */
export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  OTP_INVALID: 422,
  OTP_EXPIRED: 410,
  OTP_TOO_MANY_ATTEMPTS: 429,
  SEAT_TAKEN: 409,
  HOLD_EXPIRED: 410,
  BOOKING_NOT_PAYABLE: 409,
  PAYMENT_SIGNATURE_INVALID: 422,
  PAYMENT_AMOUNT_MISMATCH: 422,
  TICKET_NOT_ACTIVATABLE: 409,
  TICKET_ALREADY_ACTIVE: 409,
  ACTIVATION_WINDOW_CLOSED: 422,
  TICKET_NOT_CANCELLABLE: 409,
  TICKET_NOT_GIFTABLE: 422,
  RECIPIENT_NOT_FOUND: 422,
  GIFT_TO_SELF: 422,
  PASS_NOT_ELIGIBLE: 422,
  PASS_ALREADY_ACTIVE: 409,
  ELIGIBILITY_REQUIRED: 422,
  DEVICE_NOT_APPROVED: 403,
  TRIP_NOT_ASSIGNED: 403,
  TRIP_NOT_STARTABLE: 409,
  BUS_NOT_AVAILABLE: 409,
  COMPLAINT_STATUS_INVALID: 409,
  EMAIL_DELIVERY_FAILED: 503,
  INTERNAL: 500,
};

const errorCodeValues = Object.values(ErrorCode) as [ErrorCode, ...ErrorCode[]];
export const ErrorCodeSchema = z.enum(errorCodeValues);

/** Error body returned by every failing API call (docs/06, Error shape). */
export const ErrorResponse = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
    requestId: z.string(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponse>;

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && value in ErrorCode;
}
