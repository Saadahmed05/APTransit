import type {
  ErrorCode,
  ScanReason,
  TicketStatus,
  TicketType,
  TripStatus,
} from "@aptransit/shared";

// docs/07 ticket rules, implemented once (sections 1, 2, 6, 7). Pure functions: times are UTC
// Dates, minutes come from settings. Controllers and services never repeat these checks.

const MS_PER_MIN = 60_000;

/**
 * docs/07 section 5, checks 5 to 11a after parsing, signature, code and existence. The segment
 * checks (D-035) use the resolved boarding stop: `stopSeq` null means the stop source is NONE and
 * every stop check is skipped. `boardingSeq` and `droppingSeq` are the ticket's own stops (null for passes).
 */
export function scanStatusReason(input: {
  status: string;
  validUntil: Date | null;
  now: Date;
  alreadyScanned: boolean;
  wrongTrip: boolean;
  wrongDate: boolean;
  serviceEligible: boolean;
  stopSeq?: number | null;
  boardingSeq?: number | null;
  droppingSeq?: number | null;
  /** Pass: its validity start (activation). Null or absent for tickets. */
  validFrom?: Date | null;
  /** Route restricted pass: the trip's route holds both pass stops. True for everything else. */
  routeCovered?: boolean;
}): ScanReason {
  if (["CANCELLED", "REFUNDED"].includes(input.status)) return "CANCELLED";
  if (input.status === "EXPIRED" || (input.validUntil !== null && input.now > input.validUntil))
    return "EXPIRED";
  if (["BOOKED", "READY", "PENDING_PAYMENT"].includes(input.status)) return "NOT_ACTIVATED";
  if (["SCANNED", "USED"].includes(input.status) || input.alreadyScanned) return "ALREADY_SCANNED";
  if (input.wrongTrip) return "WRONG_TRIP";
  if (input.wrongDate) return "WRONG_DATE";
  const stopSeq = input.stopSeq ?? null;
  const droppingSeq = input.droppingSeq ?? null;
  const boardingSeq = input.boardingSeq ?? null;
  // 10a: the bus is at or past the stop where this ticket ends
  if (stopSeq !== null && droppingSeq !== null && stopSeq >= droppingSeq) return "PAST_DESTINATION";
  // 10b: more than one stop before the ticket's boarding stop
  if (stopSeq !== null && boardingSeq !== null && stopSeq < boardingSeq - 1) return "BEFORE_BOARDING_STOP";
  // 10c: a pass scanned before its validity starts
  if (input.validFrom && input.now < input.validFrom) return "NOT_YET_VALID";
  if (!input.serviceEligible) return "SERVICE_NOT_ELIGIBLE";
  // 11a: a route restricted pass on a route without both of its stops
  if (input.routeCovered === false) return "ROUTE_NOT_COVERED";
  return "OK";
}

export const TICKET_SETTING_DEFAULTS = {
  "activation.opensMinutesBefore": 60,
  "activation.closesMinutesAfter": 30,
  "ticket.graceMinutesAfterArrival": 60,
  "gift.cutoffMinutesBefore": 120,
  "gift.maxTransfers": 1,
} as const;
export type TicketSettingKey = keyof typeof TICKET_SETTING_DEFAULTS;
export type TicketSettings = Record<TicketSettingKey, number>;

export interface BoardingTimes {
  /** Scheduled departure from the boarding stop. */
  boardingDepartureAt: Date;
  delayMinutes: number;
}

export interface ActivationWindow {
  opensAt: Date;
  closesAt: Date;
}

/** Window opens at scheduledDeparture(boardingStop) minus activation.opensMinutesBefore. */
export function activationOpensAt(
  { boardingDepartureAt }: BoardingTimes,
  opensMinutesBefore: number,
): Date {
  return new Date(boardingDepartureAt.getTime() - opensMinutesBefore * MS_PER_MIN);
}

/**
 * Window closes at scheduledDeparture(boardingStop) + trip.delayMinutes + activation.closesMinutesAfter.
 * A BOOKED ticket expires at this time (tickets.expiresAt).
 */
export function activationClosesAt(
  { boardingDepartureAt, delayMinutes }: BoardingTimes,
  closesMinutesAfter: number,
): Date {
  return new Date(boardingDepartureAt.getTime() + (delayMinutes + closesMinutesAfter) * MS_PER_MIN);
}

export function activationWindow(
  times: BoardingTimes,
  settings: Pick<TicketSettings, "activation.opensMinutesBefore" | "activation.closesMinutesAfter">,
): ActivationWindow {
  return {
    opensAt: activationOpensAt(times, settings["activation.opensMinutesBefore"]),
    closesAt: activationClosesAt(times, settings["activation.closesMinutesAfter"]),
  };
}

/** validUntil = scheduledArrivalAt(droppingStop) + trip.delayMinutes + ticket.graceMinutesAfterArrival. */
export function computeValidUntil(
  droppingArrivalAt: Date,
  delayMinutes: number,
  graceMinutesAfterArrival: number,
): Date {
  return new Date(
    droppingArrivalAt.getTime() + (delayMinutes + graceMinutesAfterArrival) * MS_PER_MIN,
  );
}

export type RuleResult = { ok: true } | { ok: false; error: ErrorCode };

const OK: RuleResult = { ok: true };
const fail = (error: ErrorCode): RuleResult => ({ ok: false, error });

export interface TicketState {
  status: TicketStatus;
  type: TicketType;
  transferCount: number;
}

/** BOOKED to ACTIVE (docs/07 section 2): holder, inside the window, trip not cancelled. */
export function canActivate(
  ticket: TicketState,
  window: ActivationWindow,
  tripStatus: TripStatus,
  now: Date,
): RuleResult {
  if (ticket.status === "ACTIVE") return fail("TICKET_ALREADY_ACTIVE");
  if (ticket.status !== "BOOKED" || tripStatus === "CANCELLED" || tripStatus === "COMPLETED") {
    return fail("TICKET_NOT_ACTIVATABLE");
  }
  if (now.getTime() < window.opensAt.getTime() || now.getTime() > window.closesAt.getTime()) {
    return fail("ACTIVATION_WINDOW_CLOSED");
  }
  return OK;
}

/**
 * BOOKED to CANCELLED: only paid, not activated tickets, while the refund policy still gives a
 * refund (by default at least 60 min before departure). `refundCancellable` comes from fare.ts refundQuote.
 */
export function canCancel(ticket: TicketState, refundCancellable: boolean): RuleResult {
  if (ticket.status !== "BOOKED" || ticket.type !== "SINGLE" || !refundCancellable) {
    return fail("TICKET_NOT_CANCELLABLE");
  }
  return OK;
}

/** docs/07 section 7, everything except the recipient checks (those need the recipient). */
export function canGift(
  ticket: TicketState,
  boardingDepartureAt: Date,
  now: Date,
  settings: Pick<TicketSettings, "gift.cutoffMinutesBefore" | "gift.maxTransfers">,
): RuleResult {
  const cutoff = boardingDepartureAt.getTime() - settings["gift.cutoffMinutesBefore"] * MS_PER_MIN;
  if (
    ticket.type !== "SINGLE" ||
    ticket.status !== "BOOKED" ||
    ticket.transferCount >= settings["gift.maxTransfers"] ||
    now.getTime() >= cutoff
  ) {
    return fail("TICKET_NOT_GIFTABLE");
  }
  return OK;
}

/**
 * The server job's transition for a ticket at `now`, or null when nothing changes:
 * BOOKED to EXPIRED after the window closed, ACTIVE to EXPIRED after validUntil (never scanned),
 * SCANNED to USED when the trip completed or validUntil passed.
 */
export function nextStatusOnJob(
  ticket: { status: TicketStatus; validUntil: Date | null },
  window: ActivationWindow,
  tripStatus: TripStatus,
  now: Date,
): TicketStatus | null {
  const after = (time: Date | null) => time !== null && now.getTime() > time.getTime();
  switch (ticket.status) {
    case "BOOKED":
      return after(window.closesAt) ? "EXPIRED" : null;
    case "ACTIVE":
      return after(ticket.validUntil) ? "EXPIRED" : null;
    case "SCANNED":
      return tripStatus === "COMPLETED" || after(ticket.validUntil) ? "USED" : null;
    default:
      return null;
  }
}

/** Upcoming tab: still usable (not finished, not cancelled) and not past its last valid moment. */
export function isUpcoming(
  ticket: { status: TicketStatus; expiresAt: Date; validUntil: Date | null },
  now: Date,
): boolean {
  if (ticket.status === "BOOKED") return ticket.expiresAt.getTime() >= now.getTime();
  if (ticket.status === "ACTIVE" || ticket.status === "SCANNED") {
    return (ticket.validUntil ?? ticket.expiresAt).getTime() >= now.getTime();
  }
  return false;
}
