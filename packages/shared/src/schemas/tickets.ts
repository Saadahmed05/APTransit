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

export const CancelTicketResult = z.object({
  ticket: TicketDto,
  refund: TicketRefundDto,
});
export type CancelTicketResult = z.infer<typeof CancelTicketResult>;
