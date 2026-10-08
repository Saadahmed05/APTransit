import { describe, expect, it } from "vitest";
import { demandBandOfHour, demandLevelOf } from "./analytics";

describe("demand bands and levels", () => {
  it("puts IST hours in the search bands", () => {
    expect(demandBandOfHour(5)).toBe("MORNING");
    expect(demandBandOfHour(11)).toBe("MORNING");
    expect(demandBandOfHour(12)).toBe("AFTERNOON");
    expect(demandBandOfHour(16)).toBe("AFTERNOON");
    expect(demandBandOfHour(17)).toBe("EVENING");
    expect(demandBandOfHour(20)).toBe("EVENING");
    expect(demandBandOfHour(21)).toBe("NIGHT");
    expect(demandBandOfHour(0)).toBe("NIGHT");
    expect(demandBandOfHour(4)).toBe("NIGHT");
  });

  it("uses the fixed thresholds: under 50 LOW, 50 to 80 MEDIUM, over 80 HIGH", () => {
    expect(demandLevelOf(0)).toBe("LOW");
    expect(demandLevelOf(49.9)).toBe("LOW");
    expect(demandLevelOf(50)).toBe("MEDIUM");
    expect(demandLevelOf(80)).toBe("MEDIUM");
    expect(demandLevelOf(80.1)).toBe("HIGH");
    expect(demandLevelOf(100)).toBe("HIGH");
  });
});
