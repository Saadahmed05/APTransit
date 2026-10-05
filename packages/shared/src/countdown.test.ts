import { describe, expect, it } from "vitest";
import { countdownParts, countdownTickMs } from "./countdown";
import { normalizeRecipient, TransferTicketInput } from "./schemas/tickets";
import { StreeShaktiCheckInput } from "./schemas/passes";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("countdownParts", () => {
  it("splits days, hours and minutes when more than a day is left", () => {
    const parts = countdownParts(5 * DAY + 8 * HOUR + 21 * MIN + 9_500, 0);
    expect(parts).toMatchObject({ days: 5, hours: 8, minutes: 21, seconds: 9, showSeconds: false, done: false });
  });

  it("shows seconds under 24 hours", () => {
    expect(countdownParts(8 * HOUR + 21 * MIN + 9_000, 0)).toMatchObject({ days: 0, hours: 8, minutes: 21, seconds: 9, showSeconds: true });
    expect(countdownParts(DAY, 0).showSeconds).toBe(false);
    expect(countdownParts(DAY - 1, 0).showSeconds).toBe(true);
  });

  it("is done and never negative after the end", () => {
    expect(countdownParts(1_000, 5_000)).toMatchObject({ totalMs: 0, days: 0, hours: 0, minutes: 0, seconds: 0, done: true });
  });

  it("ticks on the next visible change", () => {
    expect(countdownTickMs(countdownParts(HOUR + 1_250, 0))).toBe(250);
    expect(countdownTickMs(countdownParts(2 * DAY + 30_000, 0))).toBe(30_000);
    expect(countdownTickMs(countdownParts(2 * DAY, 0))).toBe(MIN);
    expect(countdownTickMs(countdownParts(0, 0))).toBe(0);
  });
});

describe("normalizeRecipient", () => {
  it("lower cases emails", () => {
    expect(normalizeRecipient(" Citizen2@APTransit.test ")).toEqual({ channel: "EMAIL", value: "citizen2@aptransit.test" });
  });

  it("accepts Indian mobile numbers in common shapes", () => {
    for (const input of ["9876543210", "+919876543210", "91 98765 43210", "+91 98765-43210"]) {
      expect(normalizeRecipient(input)).toEqual({ channel: "PHONE", value: "+919876543210" });
    }
  });

  it("refuses anything else", () => {
    for (const input of ["12345", "not an email@", "a@b", "+1 2025550123", "0987654321"]) {
      expect(normalizeRecipient(input)).toBeNull();
    }
  });

  it("TransferTicketInput returns the normalised recipient", () => {
    expect(TransferTicketInput.parse({ recipient: "98765 43210" })).toEqual({ recipient: { channel: "PHONE", value: "+919876543210" } });
    expect(TransferTicketInput.safeParse({ recipient: "nobody" }).success).toBe(false);
  });
});

describe("StreeShaktiCheckInput", () => {
  const valid = { consent: true, declaration: { category: "WOMAN", apDomicile: true }, idType: "AADHAAR" };

  it("accepts the declaration without any identifier", () => {
    expect(StreeShaktiCheckInput.parse(valid)).toEqual(valid);
  });

  it("rejects unknown keys anywhere, so an ID number can never be sent", () => {
    expect(StreeShaktiCheckInput.safeParse({ ...valid, idNumber: "1234 5678 9012" }).success).toBe(false);
    expect(StreeShaktiCheckInput.safeParse({ ...valid, declaration: { ...valid.declaration, aadhaar: "123456789012" } }).success).toBe(false);
  });

  it("takes the category as a code, not free text", () => {
    expect(StreeShaktiCheckInput.safeParse({ ...valid, declaration: { category: "1234 5678", apDomicile: true } }).success).toBe(false);
  });
});
