import { z } from "zod";
import { RefundStatus, ServiceType, TicketStatus, TicketType } from "../enums";
import { Paise } from "../money";
import { DisplayStatus } from "../status";

export const TicketScope = z.enum(["upcoming", "past"]);
export type TicketScope = z.infer<typeof TicketScope>;

export const TicketsQuery = z.object({
  scope: TicketScope.default("upcoming"),
});
export type TicketsQuery = z.infer<typeof TicketsQuery>;

const NamedStop = z.object({ stopId: z.string(), nameEn: z.string(), nameTe: z.string() });

export const TicketRefundDto = z.object({
  amountPaise: Paise,
  status: RefundStatus,
});
export type TicketRefundDto = z.infer<typeof TicketRefundDto>;

/** A row in My tickets (docs/11 /tickets). */
export const TicketSummaryDto = z.object({
  id: z.string(),
  code: z.string(),
  bookingId: z.string().nullable(),
  tripId: z.string(),
  type: TicketType,
  status: TicketStatus,
  seatNo: z.string().nullable(),
  routeCode: z.string(),
  routeNameEn: z.string(),
  routeNameTe: z.string(),
  serviceType: ServiceType,
  serviceDate: z.string(),
  boarding: NamedStop,
  dropping: NamedStop,
  /** Scheduled departure from the boarding stop, ISO UTC. */
  departureAt: z.string().datetime(),
  /** Scheduled arrival at the dropping stop, ISO UTC. */
  arrivalAt: z.string().datetime(),
  activationOpensAt: z.string().datetime(),
  refund: TicketRefundDto.nullable(),
});
export type TicketSummaryDto = z.infer<typeof TicketSummaryDto>;

export const TicketsResponse = z.array(TicketSummaryDto);

/** GET /tickets/:id (docs/06): the summary plus everything the ticket screen needs. */
export const TicketDto = TicketSummaryDto.extend({
  passengerName: z.string().nullable(),
  farePaise: Paise,
  busRegNo: z.string().nullable(),
  /** Live trip status for the badge next to the ticket status. */
  displayStatus: DisplayStatus,
  delayMinutes: z.number().int().nonnegative(),
  activatedAt: z.string().datetime().nullable(),
  validUntil: z.string().datetime().nullable(),
  expiresAt: z.string().datetime(),
  activationClosesAt: z.string().datetime(),
  giftable: z.boolean(),
  transferCount: z.number().int().nonnegative(),
  /** validUntil the ticket would get if activated now (for the confirmation: "Valid until 01:10 PM"). */
  activationValidUntil: z.string().datetime(),
  /** Last moment a gift is allowed (departure minus gift.cutoffMinutesBefore). */
  giftCutoffAt: z.string().datetime(),
  canActivate: z.boolean(),
  canCancel: z.boolean(),
  canGift: z.boolean(),
});
export type TicketDto = z.infer<typeof TicketDto>;

/** GET /tickets/:id/qr. rotSecret (base64url, 32 bytes) only while ACTIVE. */
export const TicketQrDto = z.object({
  token: z.string(),
  rotSecret: z.string().nullable(),
  periodSec: z.number().int().positive(),
  serverTime: z.string().datetime(),
});
export type TicketQrDto = z.infer<typeof TicketQrDto>;

export const RefundQuoteDto = z.object({
  cancellable: z.boolean(),
  percent: z.number().int().min(0).max(100),
  amountPaise: Paise,
  feePaise: Paise,
  policyName: z.string(),
});
export type RefundQuoteDto = z.infer<typeof RefundQuoteDto>;

/** POST /tickets/:id/transfer. `recipient` is a phone (+91 and 10 digits, spaces allowed) or an email. */
export const TransferTicketInput = z
  .object({
    recipient: z.string().trim().min(3).max(254),
  })
  .transform((data, ctx) => {
    const recipient = normalizeRecipient(data.recipient);
    if (!recipient) {
      ctx.addIssue({ code: "custom", message: "Enter a phone number or an email address", path: ["recipient"] });
      return z.NEVER;
    }
    return { recipient };
  });
export type TransferTicketInput = z.infer<typeof TransferTicketInput>;

export const TransferTicketResult = z.object({
  ticketId: z.string(),
  recipientMasked: z.string(),
});
export type TransferTicketResult = z.infer<typeof TransferTicketResult>;

export type NormalizedRecipient = { channel: "EMAIL" | "PHONE"; value: string };

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Phone or email, normalised the way users are stored: emails lower cased, phones as +91 and 10
 * digits (a bare 10 digit number or 91 and 10 digits are accepted). Null when it is neither.
 */
export function normalizeRecipient(input: string): NormalizedRecipient | null {
  const text = input.trim();
  if (text.includes("@")) {
    const email = text.toLowerCase();
    return EMAIL_SHAPE.test(email) && email.length <= 254 ? { channel: "EMAIL", value: email } : null;
  }
  const digits = text.replace(/[\s()-]/g, "");
  const match = /^(?:\+?91)?([6-9]\d{9})$/.exec(digits);
  return match ? { channel: "PHONE", value: `+91${match[1]}` } : null;
}

export const CancelTicketResult = z.object({
  ticket: TicketDto,
  refund: TicketRefundDto,
});
export type CancelTicketResult = z.infer<typeof CancelTicketResult>;
