import { describe, expect, it } from "vitest";
import {
  calculateLoadFactor,
  calculateOnTimePct,
  calculateRevenue,
} from "../src/modules/rollups/rollups.service";

describe("Rollup math calculations", () => {
  describe("onTimePct", () => {
    it("returns 100% when there are no completed trips", () => {
      expect(calculateOnTimePct([])).toBe(100);
    });

    it("calculates percentage of trips with delay under 5 minutes", () => {
      const trips = [
        { delayMinutes: 0 },
        { delayMinutes: 4 },
        { delayMinutes: 5 }, // 5 min delay is not under 5 min
        { delayMinutes: 12 },
      ];
      // 2 out of 4 are strictly under 5 min -> 50%
      expect(calculateOnTimePct(trips)).toBe(50);
    });

    it("handles all on-time and all delayed trips correctly", () => {
      const allOnTime = [{ delayMinutes: 0 }, { delayMinutes: 2 }];
      expect(calculateOnTimePct(allOnTime)).toBe(100);

      const allDelayed = [{ delayMinutes: 10 }, { delayMinutes: 20 }];
      expect(calculateOnTimePct(allDelayed)).toBe(0);
    });
  });

  describe("load factor", () => {
    it("returns 0 when total seats is zero or negative", () => {
      expect(calculateLoadFactor(10, 0)).toBe(0);
      expect(calculateLoadFactor(10, -5)).toBe(0);
    });

    it("calculates percentage of tickets over seats correctly", () => {
      expect(calculateLoadFactor(25, 50)).toBe(50);
      expect(calculateLoadFactor(38, 40)).toBe(95);
      expect(calculateLoadFactor(1, 3)).toBe(33.3);
    });

    it("clamps at 100% max", () => {
      expect(calculateLoadFactor(60, 50)).toBe(100);
    });
  });

  describe("revenue", () => {
    it("calculates captured minus refunded in paise", () => {
      expect(calculateRevenue(100000n, 20000n)).toBe(80000n);
      expect(calculateRevenue(5000, 1500)).toBe(3500n);
    });

    it("never returns negative revenue", () => {
      expect(calculateRevenue(1000n, 2000n)).toBe(0n);
    });
  });
});
