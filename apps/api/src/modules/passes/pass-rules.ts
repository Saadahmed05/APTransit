import type { ErrorCode, PassKind, PassStatus, ServiceType } from "@aptransit/shared";
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

/**
 * validFrom = activatedAt, validUntil = activatedAt + durationDays. A free travel pass never
 * outlives its eligibility check (docs/07 section 8: until the eligibility check expires).
 */
export function passValidity(
  activatedAt: Date,
  durationDays: number,
  eligibilityExpiresAt?: Date | null,
): { validFrom: Date; validUntil: Date } {
  const byDuration = activatedAt.getTime() + durationDays * MS_PER_DAY;
  const until = eligibilityExpiresAt ? Math.min(byDuration, eligibilityExpiresAt.getTime()) : byDuration;
  return { validFrom: activatedAt, validUntil: new Date(until) };
}

/** A FREE_TRAVEL pass needs a current ELIGIBLE check. Paid kinds need nothing. */
export function canCreatePass(
  kind: PassKind,
  eligibility: { result: "ELIGIBLE" | "NOT_ELIGIBLE"; expiresAt: Date } | null,
  hasOpenFreeTravelPass: boolean,
  now: Date,
): RuleResult {
  if (kind !== "FREE_TRAVEL") return OK;
  if (!eligibility || eligibility.result !== "ELIGIBLE" || eligibility.expiresAt.getTime() <= now.getTime()) {
    return fail("ELIGIBILITY_REQUIRED");
  }
  // One free travel pass at a time: a READY or ACTIVE one already covers the citizen
  if (hasOpenFreeTravelPass) return fail("PASS_ALREADY_ACTIVE");
  return OK;
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
