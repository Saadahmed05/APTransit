// docs/07 ticket rules, implemented once. Times are UTC Date objects; minutes come from settings.

const MS_PER_MIN = 60_000;

export const TICKET_SETTING_DEFAULTS = {
  "activation.opensMinutesBefore": 60,
  "activation.closesMinutesAfter": 30,
  "ticket.graceMinutesAfterArrival": 60,
} as const;

export interface BoardingTimes {
  /** Scheduled departure from the boarding stop. */
  boardingDepartureAt: Date;
  delayMinutes: number;
}

/** Window opens at scheduledDeparture(boardingStop) minus activation.opensMinutesBefore. */
export function activationOpensAt({ boardingDepartureAt }: BoardingTimes, opensMinutesBefore: number): Date {
  return new Date(boardingDepartureAt.getTime() - opensMinutesBefore * MS_PER_MIN);
}

/**
 * Window closes at scheduledDeparture(boardingStop) + trip.delayMinutes + activation.closesMinutesAfter.
 * A BOOKED ticket expires at this time (tickets.expiresAt).
 */
export function activationClosesAt({ boardingDepartureAt, delayMinutes }: BoardingTimes, closesMinutesAfter: number): Date {
  return new Date(boardingDepartureAt.getTime() + (delayMinutes + closesMinutesAfter) * MS_PER_MIN);
}

/** validUntil = scheduledArrivalAt(droppingStop) + trip.delayMinutes + ticket.graceMinutesAfterArrival. */
export function ticketValidUntil(droppingArrivalAt: Date, delayMinutes: number, graceMinutesAfterArrival: number): Date {
  return new Date(droppingArrivalAt.getTime() + (delayMinutes + graceMinutesAfterArrival) * MS_PER_MIN);
}
