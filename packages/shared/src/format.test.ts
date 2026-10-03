import { describe, expect, it } from "vitest";
import { formatDate, formatDistance, formatDuration, formatMoney, formatTime } from "./format";

describe("format helpers", () => {
  it("formatTime formats in Asia/Kolkata timezone", () => {
    // 2026-10-02T01:00:00.000Z is 06:30 AM in IST (UTC+05:30)
    const isoUtc = "2026-10-02T01:00:00.000Z";
    const formattedEn = formatTime(isoUtc, "en");
    expect(formattedEn).toMatch(/06:30\s*(AM|am)?/i);

    const formattedTe = formatTime(isoUtc, "te");
    expect(formattedTe.length).toBeGreaterThan(0);
  });

  it("formatDate formats weekday, day, and short month", () => {
    const isoUtc = "2026-10-02T01:00:00.000Z";
    const formattedEn = formatDate(isoUtc, "en");
    expect(formattedEn).toContain("2");
    expect(formattedEn).toMatch(/Fri|Oct/i);

    const formattedTe = formatDate(isoUtc, "te");
    expect(formattedTe).toContain("2");
  });

  it("formatMoney formats paise into rupees with Indian grouping and symbol", () => {
    expect(formatMoney(54100, "en")).toBe("₹541");
    expect(formatMoney(12345600, "en")).toBe("₹1,23,456");
    expect(formatMoney(0, "en")).toBe("₹0");
    expect(formatMoney(54150, "en")).toBe("₹541.50");
  });

  it("formatDuration formats hours and minutes", () => {
    expect(formatDuration(340, "en")).toBe("5 h 40 min");
    expect(formatDuration(300, "en")).toBe("5 h");
    expect(formatDuration(40, "en")).toBe("40 min");
    expect(formatDuration(0, "en")).toBe("0 min");

    expect(formatDuration(340, "te")).toBe("5 గం 40 నిమి");
    expect(formatDuration(300, "te")).toBe("5 గం");
    expect(formatDuration(40, "te")).toBe("40 నిమి");
  });

  it("formatDistance formats whole km", () => {
    expect(formatDistance(412, "en")).toBe("412 km");
    expect(formatDistance(412.4, "en")).toBe("412 km");
    expect(formatDistance(412, "te")).toBe("412 కి.మీ");
  });
});
