import {
  type EligibilityScheme,
  type ErrorCode,
  formatIstDate,
  localTimeToUtc,
  type PassKind,
  type PassStatus,
  type PassValidityMode,
  type ServiceType,
} from "@aptransit/shared";
import type { RuleResult } from "../tickets/ticket-rules";

// docs/07 section 8, implemented once. Pure functions over UTC Dates; days come from settings.
// The countdown shown on screen is countdownParts in packages/shared (the web uses it too).

const MS_PER_MIN = 60_000;
const MS_PER_DAY = 24 * 60 * MS_PER_MIN;

export const PASS_SETTING_DEFAULTS = {
  "pass.activateWithinDays": 30,
} as const;

/** A paid pass waiting for payment longer than this is abandoned (docs/07 section 8). */
export const PASS_PAYMENT_ABANDON_MINUTES = 30;
/** PASS_EXPIRING is sent once, this long before validUntil. */
export const PASS_EXPIRING_NOTICE_HOURS = 24;

const OK: RuleResult = { ok: true };
const fail = (error: ErrorCode): RuleResult => ({ ok: false, error });

/** A READY pass must be activated before purchase (createdAt) plus pass.activateWithinDays. */
export function passActivateBy(createdAt: Date, activateWithinDays: number): Date {
  return new Date(createdAt.getTime() + activateWithinDays * MS_PER_DAY);
}

/** 23:59:59 IST of the IST calendar day that holds `at`. */
export function endOfIstDay(at: Date): Date {
  return new Date(localTimeToUtc(formatIstDate(at), "00:00").getTime() + MS_PER_DAY - 1000);
}

/**
 * Validity starts at activation (D-036). ROLLING_DAYS: validUntil = activatedAt + durationDays
 * (a weekly pass activated Sunday 12:00 runs to the next Sunday 12:00). UNTIL_DAY_END (DAY pass):
 * 23:59:59 IST of the activation day. A scheme pass (free travel, school) never outlives its
 * eligibility check.
 */
export function passValidity(
  activatedAt: Date,
  rule: { validityMode: PassValidityMode; durationDays: number },
  eligibilityExpiresAt?: Date | null,
): { validFrom: Date; validUntil: Date } {
  const end =
    rule.validityMode === "UNTIL_DAY_END"
      ? endOfIstDay(activatedAt).getTime()
      : activatedAt.getTime() + rule.durationDays * MS_PER_DAY;
  const until = eligibilityExpiresAt ? Math.min(end, eligibilityExpiresAt.getTime()) : end;
  return { validFrom: activatedAt, validUntil: new Date(until) };
}

/**
 * Buying a pass (D-036). A type with a scheme (FREE_TRAVEL: STREE_SHAKTI, SCHOOL: STUDENT) needs a
 * current ELIGIBLE check of that scheme. A route restricted type needs a home and a destination stop.
 * Only one open FREE_TRAVEL pass at a time.
 */
export function canCreatePass(
  type: { kind: PassKind; scheme: EligibilityScheme | null; routeRestricted: boolean },
  eligibility: { result: "ELIGIBLE" | "NOT_ELIGIBLE"; expiresAt: Date } | null,
  hasOpenFreeTravelPass: boolean,
  hasStops: boolean,
  now: Date,
): RuleResult {
  if (type.scheme && (!eligibility || eligibility.result !== "ELIGIBLE" || eligibility.expiresAt.getTime() <= now.getTime())) {
    return fail("ELIGIBILITY_REQUIRED");
  }
  if (type.routeRestricted !== hasStops) return fail("VALIDATION_FAILED");
  // One free travel pass at a time: a READY or ACTIVE one already covers the citizen
  if (type.kind === "FREE_TRAVEL" && hasOpenFreeTravelPass) return fail("PASS_ALREADY_ACTIVE");
  return OK;
}

/**
 * Group passes (D-036): a pass may have at most groupSize VALID scans on one trip. groupSize 1 is
 * the old "a pass is scanned once per trip" rule.
 */
export function passGroupFull(validScansOnTrip: number, groupSize: number): boolean {
  return validScansOnTrip >= groupSize;
}

/** Route restricted pass (check 11a): the trip's route holds both of the pass's stops. */
export function passRouteCovered(
  pass: { homeStopId: string | null; destStopId: string | null },
  routeStopIds: ReadonlySet<string>,
): boolean {
  if (!pass.homeStopId || !pass.destStopId) return true;
  return routeStopIds.has(pass.homeStopId) && routeStopIds.has(pass.destStopId);
}

/** READY to ACTIVE: before activateBy, and no other ACTIVE pass of the same kind (one per kind per user). */
export function canActivatePass(
  pass: { status: PassStatus; createdAt: Date },
  activateWithinDays: number,
  hasOtherActiveOfKind: boolean,
  now: Date,
): RuleResult {
  if (pass.status === "ACTIVE") return fail("PASS_ALREADY_ACTIVE");
  if (pass.status !== "READY") return fail("PASS_NOT_ELIGIBLE");
  if (now.getTime() > passActivateBy(pass.createdAt, activateWithinDays).getTime()) return fail("PASS_NOT_ELIGIBLE");
  if (hasOtherActiveOfKind) return fail("PASS_ALREADY_ACTIVE");
  return OK;
}

/** Pass check 11 (docs/07 section 5) and the free travel booking rule. */
export function passCoversService(eligibleServiceTypes: readonly ServiceType[], serviceType: ServiceType): boolean {
  return eligibleServiceTypes.includes(serviceType);
}

/** True while the pass can be shown and scanned. */
export function isPassLive(pass: { status: PassStatus; validUntil: Date | null }, now: Date): boolean {
  return pass.status === "ACTIVE" && pass.validUntil !== null && pass.validUntil.getTime() > now.getTime();
}

/**
 * The server job's transition for a pass at `now`, or null: READY past activateBy to EXPIRED,
 * ACTIVE past validUntil to EXPIRED, PENDING_PAYMENT older than 30 min to CANCELLED.
 */
export function passNextStatusOnJob(
  pass: { status: PassStatus; createdAt: Date; validUntil: Date | null },
  activateWithinDays: number,
  now: Date,
): PassStatus | null {
  switch (pass.status) {
    case "READY":
      return now.getTime() > passActivateBy(pass.createdAt, activateWithinDays).getTime() ? "EXPIRED" : null;
    case "ACTIVE":
      return pass.validUntil !== null && now.getTime() > pass.validUntil.getTime() ? "EXPIRED" : null;
    case "PENDING_PAYMENT":
      return now.getTime() - pass.createdAt.getTime() > PASS_PAYMENT_ABANDON_MINUTES * MS_PER_MIN ? "CANCELLED" : null;
    default:
      return null;
  }
}

/** PASS_EXPIRING goes out once the pass is ACTIVE and within 24 hours of validUntil. */
export function isPassExpiringSoon(pass: { status: PassStatus; validUntil: Date | null }, now: Date): boolean {
  if (pass.status !== "ACTIVE" || pass.validUntil === null) return false;
  const left = pass.validUntil.getTime() - now.getTime();
  return left > 0 && left <= PASS_EXPIRING_NOTICE_HOURS * 60 * MS_PER_MIN;
}
