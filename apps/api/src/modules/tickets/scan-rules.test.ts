import { describe, expect, it } from "vitest";
import { scanStatusReason } from "./ticket-rules";
const now = new Date("2026-10-05T05:00:00Z");
const base = {
  status: "ACTIVE",
  validUntil: new Date(now.getTime() + 60_000),
  now,
  alreadyScanned: false,
  wrongTrip: false,
  wrongDate: false,
  serviceEligible: true,
};
describe("Scan rule order", () => {
  it.each([
    ["CANCELLED", "CANCELLED"],
    ["REFUNDED", "CANCELLED"],
    ["EXPIRED", "EXPIRED"],
    ["BOOKED", "NOT_ACTIVATED"],
    ["READY", "NOT_ACTIVATED"],
    ["SCANNED", "ALREADY_SCANNED"],
    ["USED", "ALREADY_SCANNED"],
  ])("%s precedes trip/date/service failures", (status, reason) => {
    expect(
      scanStatusReason({
        ...base,
        status,
        wrongTrip: true,
        wrongDate: true,
        serviceEligible: false,
      }),
    ).toBe(reason);
  });
  it("expiry precedes activation, duplicate precedes trip, trip precedes date", () => {
    expect(
      scanStatusReason({ ...base, status: "BOOKED", validUntil: new Date(now.getTime() - 1) }),
    ).toBe("EXPIRED");
    expect(scanStatusReason({ ...base, alreadyScanned: true, wrongTrip: true })).toBe(
      "ALREADY_SCANNED",
    );
    expect(scanStatusReason({ ...base, wrongTrip: true, wrongDate: true })).toBe("WRONG_TRIP");
    expect(scanStatusReason({ ...base, wrongDate: true, serviceEligible: false })).toBe(
      "WRONG_DATE",
    );
    expect(scanStatusReason({ ...base, serviceEligible: false })).toBe("SERVICE_NOT_ELIGIBLE");
    expect(scanStatusReason(base)).toBe("OK");
  });
});
