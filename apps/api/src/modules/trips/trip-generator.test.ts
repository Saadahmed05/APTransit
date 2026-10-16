import { describe, expect, it } from "vitest";
import type { TimetableInput } from "./trip-generator";
import { addDateDays, generateTripsForTimetables } from "./trip-generator";

describe("trip generator", () => {
  const sampleTimetable: TimetableInput = {
    id: "tt_knl_vja_01",
    routeId: "rt_knl_vja",
    routeCode: "KNL-VJA-01",
    busTypeId: "bt_express",
    serviceType: "EXPRESS",
    departureLocal: "06:30",
    daysMask: 127, // All days (Mon to Sun)
    validFrom: new Date("2026-09-01T00:00:00.000Z"),
    validTo: null,
    isActive: true,
    durationMinutes: 340, // 5h 40m
  };

  it("generates trips for all active days", () => {
    // 2026-09-21 (Mon) to 2026-09-27 (Sun) is 7 days
    const trips = generateTripsForTimetables([sampleTimetable], "2026-09-21", "2026-09-27");
    expect(trips).toHaveLength(7);
    expect(trips[0]!.code).toBe("TRP-KNL-VJA-01-20260921-0630-EXP");
    expect(trips[6]!.code).toBe("TRP-KNL-VJA-01-20260927-0630-EXP");
  });

  it("respects daysMask filter for weekdays only (Mon to Fri)", () => {
    // Mon(1) + Tue(2) + Wed(4) + Thu(8) + Fri(16) = 31
    const weekdayTimetable: TimetableInput = {
      ...sampleTimetable,
      daysMask: 31,
    };
    // 2026-09-21 (Mon) to 2026-09-27 (Sun) -> 5 weekdays
    const trips = generateTripsForTimetables([weekdayTimetable], "2026-09-21", "2026-09-27");
    expect(trips).toHaveLength(5);
    const serviceDateStrs = trips.map((t) => t.serviceDateStr);
    expect(serviceDateStrs).not.toContain("2026-09-26"); // Saturday
    expect(serviceDateStrs).not.toContain("2026-09-27"); // Sunday
  });

  it("respects validFrom and validTo boundaries", () => {
    const boundedTimetable: TimetableInput = {
      ...sampleTimetable,
      validFrom: new Date("2026-09-23T00:00:00.000Z"),
      validTo: new Date("2026-09-25T23:59:59.000Z"),
    };
    const trips = generateTripsForTimetables([boundedTimetable], "2026-09-21", "2026-09-27");
    expect(trips).toHaveLength(3);
    expect(trips.map((t) => t.serviceDateStr)).toEqual([
      "2026-09-23",
      "2026-09-24",
      "2026-09-25",
    ]);
  });

  it("computes correct departure and arrival for night departure crossing midnight", () => {
    const nightTimetable: TimetableInput = {
      ...sampleTimetable,
      departureLocal: "21:30",
      durationMinutes: 340, // 5 hours 40 minutes -> arrives 03:10 next morning
    };
    const trips = generateTripsForTimetables([nightTimetable], "2026-09-24", "2026-09-24");
    expect(trips).toHaveLength(1);
    const trip = trips[0]!;

    // 21:30 IST on 2026-09-24 is 16:00 UTC
    expect(trip.scheduledDepartureAt.toISOString()).toBe("2026-09-24T16:00:00.000Z");
    // 03:10 IST on 2026-09-25 is 21:40 UTC on 2026-09-24
    expect(trip.scheduledArrivalAt.toISOString()).toBe("2026-09-24T21:40:00.000Z");
  });

  it("is idempotent: running twice yields identical codes and properties", () => {
    const run1 = generateTripsForTimetables([sampleTimetable], "2026-09-24", "2026-09-25");
    const run2 = generateTripsForTimetables([sampleTimetable], "2026-09-24", "2026-09-25");

    expect(run1).toEqual(run2);
  });

  it("gives two services leaving at the same minute their own codes (D-048)", () => {
    const superLuxury: TimetableInput = { ...sampleTimetable, id: "tt_slx", busTypeId: "bt_slx", serviceType: "SUPER_LUXURY" };
    const trips = generateTripsForTimetables([sampleTimetable, superLuxury], "2026-09-21", "2026-09-21");
    expect(trips.map((t) => t.code)).toEqual([
      "TRP-KNL-VJA-01-20260921-0630-EXP",
      "TRP-KNL-VJA-01-20260921-0630-SLX",
    ]);
  });

  it("adds calendar days across month and year ends", () => {
    expect(addDateDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDateDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDateDays("2026-10-16", 30)).toBe("2026-11-15");
  });
});
