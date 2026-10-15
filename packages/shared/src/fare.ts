import { z } from "zod";
import { roundToRupee } from "./money";

// Fare and refund math (docs/07 sections 1 and 6, docs/19 "Bus types and demo fares").
// The API quote, booking and cancel endpoints all call these. Never compute a fare anywhere else.

/** The fare rule columns that matter for the math (docs/05 fare_rules). */
export const FareRuleInput = z.object({
  baseFarePaise: z.number().int().nonnegative(),
  perKmPaise: z.number().int().nonnegative(),
  minFarePaise: z.number().int().nonnegative(),
  reservationFeePaise: z.number().int().nonnegative(),
});
export type FareRuleInput = z.infer<typeof FareRuleInput>;

export interface FareBreakdown {
  /** Distance fare after the minimum fare, rounded to the nearest rupee. */
  basePaise: number;
  reservationFeePaise: number;
  totalPaise: number;
}

export interface CalculateFareArgs {
  distanceKm: number;
  rule: FareRuleInput;
  /** Free travel ticket (Stree Shakti on an eligible service): nothing to pay. */
  isFreeTravel?: boolean;
}

/**
 * Fare for one passenger.
 * base = max(minFare, baseFare + distanceKm x perKm), rounded to the nearest rupee.
 * total = base + reservation fee. Free travel is always zero.
 */
export function calculateFare({
  distanceKm,
  rule,
  isFreeTravel = false,
}: CalculateFareArgs): FareBreakdown {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new RangeError("distanceKm must be a finite number, zero or more");
  }
  const parsed = FareRuleInput.parse(rule);
  if (isFreeTravel) {
    return { basePaise: 0, reservationFeePaise: 0, totalPaise: 0 };
  }
  const distancePaise = Math.round(distanceKm * parsed.perKmPaise);
  const basePaise = roundToRupee(
    Math.max(parsed.minFarePaise, parsed.baseFarePaise + distancePaise),
  );
  const reservationFeePaise = parsed.reservationFeePaise;
  return { basePaise, reservationFeePaise, totalPaise: basePaise + reservationFeePaise };
}

/** One refund tier: cancelling at least `minHoursBefore` hours before departure refunds `percent` of the fare. */
export const RefundTier = z.object({
  minHoursBefore: z.number().nonnegative(),
  percent: z.number().int().min(0).max(100),
});
export type RefundTier = z.infer<typeof RefundTier>;
export const RefundTiers = z.array(RefundTier);

/** Default tiers (docs/07 section 6). The live values come from the active refund_policies row. */
export const DEFAULT_REFUND_TIERS: readonly RefundTier[] = [
  { minHoursBefore: 24, percent: 90 },
  { minHoursBefore: 12, percent: 75 },
  { minHoursBefore: 1, percent: 50 },
  { minHoursBefore: 0, percent: 0 },
];

export interface RefundQuoteArgs {
  /** Fare paid for the ticket, without the reservation fee. */
  farePaise: number;
  reservationFeePaise: number;
  /** Scheduled departure from the boarding stop. */
  departureAt: Date;
  now: Date;
  tiers: readonly RefundTier[];
  /** The operator cancelled the trip: full refund including fees. */
  operatorCancelled?: boolean;
  /** Free travel ticket: nothing was paid, so nothing to refund and the holder cannot cancel. */
  isFree?: boolean;
  /** Flat fee from the refund policy, kept from the refund. */
  cancellationFeePaise?: number;
}

export interface RefundQuote {
  cancellable: boolean;
  percent: number;
  /** Money that goes back to the passenger. */
  amountPaise: number;
  /** Money that is kept: the reservation fee (unless the operator cancelled) plus any cancellation fee. */
  feePaise: number;
}

const MS_PER_HOUR = 60 * 60 * 1000;

const NOT_CANCELLABLE: RefundQuote = {
  cancellable: false,
  percent: 0,
  amountPaise: 0,
  feePaise: 0,
};

/**
 * Refund for a ticket (docs/07 section 6).
 * The highest tier whose minHoursBefore is met wins, so exactly 24 h gives the 24 h tier.
 * A tier with 0 percent (under 1 hour by default) or no matching tier means not cancellable.
 */
export function refundQuote({
  farePaise,
  reservationFeePaise,
  departureAt,
  now,
  tiers,
  operatorCancelled = false,
  isFree = false,
  cancellationFeePaise = 0,
}: RefundQuoteArgs): RefundQuote {
  for (const [name, value] of [
    ["farePaise", farePaise],
    ["reservationFeePaise", reservationFeePaise],
    ["cancellationFeePaise", cancellationFeePaise],
  ] as const) {
    if (!Number.isInteger(value) || value < 0)
      throw new RangeError(`${name} must be a non negative integer`);
  }

  if (isFree) return NOT_CANCELLABLE;

  if (operatorCancelled) {
    return {
      cancellable: true,
      percent: 100,
      amountPaise: farePaise + reservationFeePaise,
      feePaise: 0,
    };
  }

  const hoursBefore = (departureAt.getTime() - now.getTime()) / MS_PER_HOUR;
  const tier = RefundTiers.parse(tiers)
    .filter((t) => hoursBefore >= t.minHoursBefore)
    .sort((a, b) => b.minHoursBefore - a.minHoursBefore)[0];

  if (!tier || tier.percent === 0) return NOT_CANCELLABLE;

  const refundable = Math.round((farePaise * tier.percent) / 100);
  const amountPaise = Math.max(0, refundable - cancellationFeePaise);
  const feePaise = reservationFeePaise + (refundable - amountPaise);
  return { cancellable: true, percent: tier.percent, amountPaise, feePaise };
}

// Group tickets (D-042, D-046): children pay CHILD_FARE_PERCENT, seniors pay SENIOR_FARE_PERCENT.

/** Passengers younger than this are children. */
export const CHILD_MAX_AGE = 12;
/** Children pay this percent of the adult ticket (fare and reservation fee), rounded to the rupee. */
export const CHILD_FARE_PERCENT = 50;
/** Passengers of this age and older are senior citizens (owner, D-046). */
export const SENIOR_MIN_AGE = 60;
/** Seniors pay this percent of the adult ticket. The owner gave the age, not the discount: (A), docs/18. */
export const SENIOR_FARE_PERCENT = 50;

export type PassengerCategory = "ADULT" | "CHILD" | "SENIOR";

export function passengerCategory(age: number): PassengerCategory {
  if (age < CHILD_MAX_AGE) return "CHILD";
  if (age >= SENIOR_MIN_AGE) return "SENIOR";
  return "ADULT";
}

/** Percent of the adult ticket one passenger category pays. */
export const CATEGORY_FARE_PERCENT: Record<PassengerCategory, number> = {
  ADULT: 100,
  CHILD: CHILD_FARE_PERCENT,
  SENIOR: SENIOR_FARE_PERCENT,
};

/** Fare for one passenger of a given age, from the adult ticket total. */
export function passengerFarePaise(adultTotalPaise: number, age: number): number {
  const percent = CATEGORY_FARE_PERCENT[passengerCategory(age)];
  if (percent === 100) return adultTotalPaise;
  return roundToRupee(Math.round((adultTotalPaise * percent) / 100));
}

export interface GroupFare {
  adults: number;
  children: number;
  seniors: number;
  /** Fare per passenger, in the order of the ages given. */
  perPassengerPaise: number[];
  totalPaise: number;
}

/** Fare for a group (adults, children and seniors with ages). The booking total is the sum. */
export function groupFare(adultTotalPaise: number, ages: readonly number[]): GroupFare {
  const perPassengerPaise = ages.map((age) => passengerFarePaise(adultTotalPaise, age));
  const count = (c: PassengerCategory) => ages.filter((age) => passengerCategory(age) === c).length;
  return {
    adults: count("ADULT"),
    children: count("CHILD"),
    seniors: count("SENIOR"),
    perPassengerPaise,
    totalPaise: perPassengerPaise.reduce((sum, p) => sum + p, 0),
  };
}

/**
 * Splits a paid booking total over passengers by their ages (adult weight 100, child and senior
 * their fare percent). Rounding leftovers go to the first passenger, so the parts add up to the total.
 */
export function splitGroupTotal(totalPaise: number, ages: readonly number[]): number[] {
  if (ages.length === 0) return [];
  const weights = ages.map((age) => CATEGORY_FARE_PERCENT[passengerCategory(age)]);
  const weightSum = weights.reduce((s, w) => s + w, 0);
  const parts = weights.map((w) => Math.floor((totalPaise * w) / weightSum));
  parts[0] = (parts[0] ?? 0) + totalPaise - parts.reduce((s, p) => s + p, 0);
  return parts;
}
