import { describe, expect, it } from "vitest";
import { CreateBookingPassengerInput } from "./schemas/booking";
import {
  categoriesFromCounts,
  categoryFarePaise,
  groupFareByCategory,
  splitGroupTotalByCategory,
  calculateFare,
  DEFAULT_REFUND_TIERS,
  type FareRuleInput,
  groupFare,
  passengerFarePaise,
  refundQuote,
  splitGroupTotal,
} from "./fare";

// Demo fare rules from docs/19 (base fare 0, fare is per km with a minimum).
const EXPRESS: FareRuleInput = {
  baseFarePaise: 0,
  perKmPaise: 140,
  minFarePaise: 2000,
  reservationFeePaise: 3000,
};
const PALLEVELUGU: FareRuleInput = {
  baseFarePaise: 0,
  perKmPaise: 110,
  minFarePaise: 1000,
  reservationFeePaise: 0,
};
const AMARAVATI: FareRuleInput = {
  baseFarePaise: 0,
  perKmPaise: 250,
  minFarePaise: 6000,
  reservationFeePaise: 3000,
};

describe("calculateFare", () => {
  it("matches the docs/19 example: Kurnool to Vijayawada, Express, 365 km is Rs 541", () => {
    expect(calculateFare({ distanceKm: 365, rule: EXPRESS })).toEqual({
      basePaise: 51100,
      reservationFeePaise: 3000,
      totalPaise: 54100,
    });
  });

  it("applies the minimum fare on short trips", () => {
    // 5 km x 110 = Rs 5.50, below the Rs 10 minimum
    expect(calculateFare({ distanceKm: 5, rule: PALLEVELUGU })).toEqual({
      basePaise: 1000,
      reservationFeePaise: 0,
      totalPaise: 1000,
    });
  });

  it("uses the distance fare when it is exactly the minimum", () => {
    // 8 km x 250 = Rs 20, below Rs 60, so minimum. 24 km x 250 = Rs 60 exactly.
    expect(calculateFare({ distanceKm: 24, rule: AMARAVATI }).basePaise).toBe(6000);
    expect(calculateFare({ distanceKm: 8, rule: AMARAVATI }).basePaise).toBe(6000);
  });

  it("rounds to the nearest rupee, half up", () => {
    // 15 km x 110 = 1650 paise, rounds up to Rs 17
    expect(calculateFare({ distanceKm: 15, rule: PALLEVELUGU }).basePaise).toBe(1700);
    // 13 km x 110 = 1430 paise, rounds down to Rs 14
    expect(calculateFare({ distanceKm: 13, rule: PALLEVELUGU }).basePaise).toBe(1400);
  });

  it("handles fractional distances without float noise", () => {
    // 12.5 km x 110 = 1375 paise, rounds to Rs 14
    expect(calculateFare({ distanceKm: 12.5, rule: PALLEVELUGU }).basePaise).toBe(1400);
    // 0.1 x 3 style float: 70.3 km x 140 = 9842 paise, Rs 98
    expect(calculateFare({ distanceKm: 70.3, rule: EXPRESS }).basePaise).toBe(9800);
  });

  it("adds a base fare before the minimum check", () => {
    const rule = { ...PALLEVELUGU, baseFarePaise: 500 };
    // 500 + 5 x 110 = 1050, above the Rs 10 minimum, rounds to Rs 11
    expect(calculateFare({ distanceKm: 5, rule }).basePaise).toBe(1100);
  });

  it("returns zero for free travel", () => {
    expect(calculateFare({ distanceKm: 365, rule: EXPRESS, isFreeTravel: true })).toEqual({
      basePaise: 0,
      reservationFeePaise: 0,
      totalPaise: 0,
    });
  });

  it("returns the minimum fare for zero distance", () => {
    expect(calculateFare({ distanceKm: 0, rule: EXPRESS }).totalPaise).toBe(5000);
  });

  it("refuses bad input", () => {
    expect(() => calculateFare({ distanceKm: -1, rule: EXPRESS })).toThrow(RangeError);
    expect(() => calculateFare({ distanceKm: Number.NaN, rule: EXPRESS })).toThrow(RangeError);
    expect(() => calculateFare({ distanceKm: 1, rule: { ...EXPRESS, perKmPaise: 1.5 } })).toThrow();
    expect(() =>
      calculateFare({ distanceKm: 1, rule: { ...EXPRESS, minFarePaise: -1 } }),
    ).toThrow();
  });
});

describe("refundQuote", () => {
  const departureAt = new Date("2026-10-01T01:00:00.000Z");
  const hoursBefore = (h: number) => new Date(departureAt.getTime() - h * 60 * 60 * 1000);
  const base = {
    farePaise: 51100,
    reservationFeePaise: 3000,
    departureAt,
    tiers: DEFAULT_REFUND_TIERS,
  };

  it.each([
    [48, 90, 45990],
    [24, 90, 45990],
    [23.99, 75, 38325],
    [12, 75, 38325],
    [11.99, 50, 25550],
    [1, 50, 25550],
  ])("%s hours before gives %s percent", (hours, percent, amountPaise) => {
    const q = refundQuote({ ...base, now: hoursBefore(hours) });
    // The reservation fee is never refunded by the holder cancelling
    expect(q).toEqual({ cancellable: true, percent, amountPaise, feePaise: 3000 });
  });

  it.each([0.99, 0.5, 0, -1])("%s hours before is not cancellable", (hours) => {
    expect(refundQuote({ ...base, now: hoursBefore(hours) })).toEqual({
      cancellable: false,
      percent: 0,
      amountPaise: 0,
      feePaise: 0,
    });
  });

  it("refunds everything including the reservation fee when the operator cancels", () => {
    // Even after departure
    expect(refundQuote({ ...base, now: hoursBefore(-2), operatorCancelled: true })).toEqual({
      cancellable: true,
      percent: 100,
      amountPaise: 54100,
      feePaise: 0,
    });
  });

  it("never refunds a free ticket", () => {
    expect(
      refundQuote({
        ...base,
        farePaise: 0,
        reservationFeePaise: 0,
        now: hoursBefore(48),
        isFree: true,
      }),
    ).toEqual({
      cancellable: false,
      percent: 0,
      amountPaise: 0,
      feePaise: 0,
    });
    // Free wins over operator cancel: nothing was paid
    expect(
      refundQuote({ ...base, now: hoursBefore(48), isFree: true, operatorCancelled: true })
        .amountPaise,
    ).toBe(0);
  });

  it("keeps a policy cancellation fee", () => {
    const q = refundQuote({ ...base, now: hoursBefore(48), cancellationFeePaise: 1000 });
    expect(q.amountPaise).toBe(44990);
    expect(q.feePaise).toBe(4000);
  });

  it("never refunds a negative amount when the fee is larger than the refund", () => {
    const q = refundQuote({
      ...base,
      farePaise: 1000,
      now: hoursBefore(2),
      cancellationFeePaise: 2000,
    });
    expect(q.amountPaise).toBe(0);
    expect(q.feePaise).toBe(3000 + 500);
  });

  it("does not depend on the tier order", () => {
    const shuffled = [...DEFAULT_REFUND_TIERS].reverse();
    expect(refundQuote({ ...base, tiers: shuffled, now: hoursBefore(30) }).percent).toBe(90);
    expect(refundQuote({ ...base, tiers: shuffled, now: hoursBefore(5) }).percent).toBe(50);
  });

  it("uses custom policy tiers", () => {
    const tiers = [
      { minHoursBefore: 2, percent: 100 },
      { minHoursBefore: 0.5, percent: 25 },
    ];
    expect(refundQuote({ ...base, tiers, now: hoursBefore(3) }).percent).toBe(100);
    expect(refundQuote({ ...base, tiers, now: hoursBefore(1) }).percent).toBe(25);
    expect(refundQuote({ ...base, tiers, now: hoursBefore(0.25) }).cancellable).toBe(false);
  });

  it("is not cancellable with no tiers", () => {
    expect(refundQuote({ ...base, tiers: [], now: hoursBefore(48) }).cancellable).toBe(false);
  });

  it("refuses bad amounts and bad tiers", () => {
    expect(() => refundQuote({ ...base, farePaise: -1, now: hoursBefore(48) })).toThrow(RangeError);
    expect(() => refundQuote({ ...base, farePaise: 10.5, now: hoursBefore(48) })).toThrow(
      RangeError,
    );
    expect(() =>
      refundQuote({ ...base, now: hoursBefore(48), tiers: [{ minHoursBefore: 1, percent: 120 }] }),
    ).toThrow();
  });
});

describe("group fares (D-042)", () => {
  it("charges children half, rounded to the rupee", () => {
    expect(passengerFarePaise(15_100, 30)).toBe(15_100);
    expect(passengerFarePaise(15_100, 8)).toBe(7_600);
    const g = groupFare(15_100, [35, 33, 8, 4]);
    expect(g).toMatchObject({ adults: 2, children: 2, totalPaise: 15_100 * 2 + 7_600 * 2 });
    const parts = splitGroupTotal(g.totalPaise, [35, 33, 8, 4]);
    expect(parts.reduce((s, p) => s + p, 0)).toBe(g.totalPaise);
    expect(Math.abs((parts[2] ?? 0) - 7_600)).toBeLessThan(100);
  });
});

describe("category fares (D-048)", () => {
  it("prices each category from the adult ticket", () => {
    expect(categoryFarePaise(57_100, "ADULT")).toBe(57_100);
    expect(categoryFarePaise(57_100, "CHILD")).toBe(28_600);
    expect(categoryFarePaise(57_100, "SENIOR")).toBe(28_600);
  });

  it("matches the age based group fare for the same travellers", () => {
    const byAge = groupFare(57_100, [35, 8, 65]);
    const byCategory = groupFareByCategory(57_100, ["ADULT", "CHILD", "SENIOR"]);
    expect(byCategory).toEqual(byAge);
    expect(byCategory).toMatchObject({ adults: 1, children: 1, seniors: 1, totalPaise: 114_300 });
  });

  it("splits a total by category so the parts add up", () => {
    const parts = splitGroupTotalByCategory(114_301, ["ADULT", "CHILD", "SENIOR"]);
    expect(parts.reduce((s, p) => s + p, 0)).toBe(114_301);
    expect(parts[1]).toBe(parts[2]);
    expect(splitGroupTotal(114_301, [35, 8, 65])).toEqual(parts);
  });

  it("turns counts into a category list, adults first", () => {
    expect(categoriesFromCounts({ ADULT: 2, CHILD: 1, SENIOR: 1 })).toEqual(["ADULT", "ADULT", "SENIOR", "CHILD"]);
    expect(categoriesFromCounts({ CHILD: -1 })).toEqual([]);
  });
});

describe("booking passenger input (D-048)", () => {
  it("takes a category, or an age from older clients, and never needs a name or gender", () => {
    expect(CreateBookingPassengerInput.safeParse({ category: "SENIOR" }).success).toBe(true);
    expect(CreateBookingPassengerInput.safeParse({ age: 30, seatNo: "4" }).success).toBe(true);
    expect(CreateBookingPassengerInput.safeParse({ seatNo: "4" }).success).toBe(false);
    expect(CreateBookingPassengerInput.safeParse({ category: "TEEN" }).success).toBe(false);
  });
});
