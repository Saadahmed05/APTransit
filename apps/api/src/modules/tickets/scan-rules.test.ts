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

// D-035: the segment and validity checks 10a, 10b, 10c and 11a, in docs/07 section 5 order.
describe("Scan rule order: segment checks (D-035)", () => {
  // Ticket from stop 3 to stop 6
  const segment = { ...base, boardingSeq: 3, droppingSeq: 6 };

  it("rejects at or after the dropping stop", () => {
    expect(scanStatusReason({ ...segment, stopSeq: 6 })).toBe("PAST_DESTINATION");
    expect(scanStatusReason({ ...segment, stopSeq: 8 })).toBe("PAST_DESTINATION");
  });

  it("rejects more than one stop before the boarding stop, allows one stop early", () => {
    expect(scanStatusReason({ ...segment, stopSeq: 1 })).toBe("BEFORE_BOARDING_STOP");
    expect(scanStatusReason({ ...segment, stopSeq: 2 })).toBe("OK");
    expect(scanStatusReason({ ...segment, stopSeq: 3 })).toBe("OK");
    expect(scanStatusReason({ ...segment, stopSeq: 5 })).toBe("OK");
  });

  it("skips every stop check when the stop is unknown (source NONE)", () => {
    expect(scanStatusReason({ ...segment, stopSeq: null })).toBe("OK");
    expect(scanStatusReason({ ...segment })).toBe("OK");
  });

  it("rejects a pass before its validity starts", () => {
    expect(scanStatusReason({ ...base, validFrom: new Date(now.getTime() + 60_000) })).toBe("NOT_YET_VALID");
    expect(scanStatusReason({ ...base, validFrom: new Date(now.getTime() - 60_000) })).toBe("OK");
  });

  it("rejects a route restricted pass off its route, after the service check", () => {
    expect(scanStatusReason({ ...base, routeCovered: false })).toBe("ROUTE_NOT_COVERED");
    expect(scanStatusReason({ ...base, routeCovered: false, serviceEligible: false })).toBe("SERVICE_NOT_ELIGIBLE");
  });

  it("keeps the order: date, then 10a, 10b, 10c, then service, then 11a", () => {
    const all = { ...segment, stopSeq: 7, validFrom: new Date(now.getTime() + 1), serviceEligible: false, routeCovered: false };
    expect(scanStatusReason({ ...all, wrongDate: true })).toBe("WRONG_DATE");
    expect(scanStatusReason(all)).toBe("PAST_DESTINATION");
    expect(scanStatusReason({ ...all, stopSeq: 1 })).toBe("BEFORE_BOARDING_STOP");
    expect(scanStatusReason({ ...all, stopSeq: 4 })).toBe("NOT_YET_VALID");
    expect(scanStatusReason({ ...all, stopSeq: 4, validFrom: null })).toBe("SERVICE_NOT_ELIGIBLE");
    expect(scanStatusReason({ ...all, stopSeq: 4, validFrom: null, serviceEligible: true })).toBe("ROUTE_NOT_COVERED");
  });

  it("checks status and duplicates before the segment", () => {
    expect(scanStatusReason({ ...segment, stopSeq: 9, alreadyScanned: true })).toBe("ALREADY_SCANNED");
    expect(scanStatusReason({ ...segment, stopSeq: 9, status: "BOOKED" })).toBe("NOT_ACTIVATED");
  });
});
