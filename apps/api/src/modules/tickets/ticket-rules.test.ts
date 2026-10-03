import type { TicketStatus } from "@aptransit/shared";
import { describe, expect, it } from "vitest";
import {
  activationClosesAt,
  activationOpensAt,
  activationWindow,
  canActivate,
  canCancel,
  canGift,
  computeValidUntil,
  isUpcoming,
  nextStatusOnJob,
  TICKET_SETTING_DEFAULTS,
  type TicketState,
} from "./ticket-rules";

const MIN = 60_000;
const departure = new Date("2026-10-04T01:00:00.000Z"); // 06:30 IST
const at = (minutesFromDeparture: number) => new Date(departure.getTime() + minutesFromDeparture * MIN);
const booked: TicketState = { status: "BOOKED", type: "SINGLE", transferCount: 0 };
const window0 = activationWindow({ boardingDepartureAt: departure, delayMinutes: 0 }, TICKET_SETTING_DEFAULTS);

describe("activation times (docs/07 section 2)", () => {
  it("opens 60 min before and closes 30 min after departure from the boarding stop", () => {
    expect(activationOpensAt({ boardingDepartureAt: departure, delayMinutes: 0 }, 60)).toEqual(at(-60));
    expect(activationClosesAt({ boardingDepartureAt: departure, delayMinutes: 0 }, 30)).toEqual(at(30));
    expect(window0).toEqual({ opensAt: at(-60), closesAt: at(30) });
  });

  it("a delay pushes the close, not the open", () => {
    const delayed = activationWindow({ boardingDepartureAt: departure, delayMinutes: 15 }, TICKET_SETTING_DEFAULTS);
    expect(delayed).toEqual({ opensAt: at(-60), closesAt: at(45) });
    expect(canActivate(booked, delayed, "RUNNING", at(40))).toEqual({ ok: true });
    expect(canActivate(booked, window0, "RUNNING", at(40))).toEqual({ ok: false, error: "ACTIVATION_WINDOW_CLOSED" });
  });

  it("validUntil is arrival plus delay plus grace", () => {
    expect(computeValidUntil(at(340), 10, 60)).toEqual(at(410));
  });
});

describe("canActivate edges", () => {
  it.each([
    ["before open", -61, { ok: false, error: "ACTIVATION_WINDOW_CLOSED" }],
    ["at open", -60, { ok: true }],
    ["inside", 0, { ok: true }],
    ["at close", 30, { ok: true }],
    ["after close", 31, { ok: false, error: "ACTIVATION_WINDOW_CLOSED" }],
  ] as const)("%s", (_label, minutes, expected) => {
    expect(canActivate(booked, window0, "SCHEDULED", at(minutes))).toEqual(expected);
  });

  it("ACTIVE to ACTIVE is TICKET_ALREADY_ACTIVE", () => {
    expect(canActivate({ ...booked, status: "ACTIVE" }, window0, "SCHEDULED", at(0))).toEqual({ ok: false, error: "TICKET_ALREADY_ACTIVE" });
  });

  it.each(["SCANNED", "USED", "CANCELLED", "REFUNDED", "EXPIRED"] as TicketStatus[])("%s cannot be activated", (status) => {
    expect(canActivate({ ...booked, status }, window0, "SCHEDULED", at(0))).toEqual({ ok: false, error: "TICKET_NOT_ACTIVATABLE" });
  });

  it("a cancelled trip cannot be activated", () => {
    expect(canActivate(booked, window0, "CANCELLED", at(0))).toEqual({ ok: false, error: "TICKET_NOT_ACTIVATABLE" });
  });
});

describe("canCancel (BOOKED to CANCELLED)", () => {
  it("allows a paid BOOKED ticket while the policy refunds", () => {
    expect(canCancel(booked, true)).toEqual({ ok: true });
  });

  it.each([
    ["under 1 hour (policy says not cancellable)", booked, false],
    ["active", { ...booked, status: "ACTIVE" as const }, true],
    ["scanned", { ...booked, status: "SCANNED" as const }, true],
    ["used", { ...booked, status: "USED" as const }, true],
    ["free travel", { ...booked, type: "FREE_TRAVEL" as const }, true],
  ])("refuses %s", (_label, ticket, cancellable) => {
    expect(canCancel(ticket, cancellable)).toEqual({ ok: false, error: "TICKET_NOT_CANCELLABLE" });
  });
});

describe("canGift (docs/07 section 7)", () => {
  const settings = { "gift.cutoffMinutesBefore": 120, "gift.maxTransfers": 1 };

  it("allows a paid BOOKED ticket before the cutoff", () => {
    expect(canGift(booked, departure, at(-121), settings)).toEqual({ ok: true });
  });

  it.each([
    ["free travel", { ...booked, type: "FREE_TRAVEL" as const }, -300],
    ["active", { ...booked, status: "ACTIVE" as const }, -300],
    ["already gifted once", { ...booked, transferCount: 1 }, -300],
    ["at the cutoff", booked, -120],
    ["after the cutoff", booked, -60],
  ])("refuses %s", (_label, ticket, minutes) => {
    expect(canGift(ticket, departure, at(minutes), settings)).toEqual({ ok: false, error: "TICKET_NOT_GIFTABLE" });
  });
});

describe("nextStatusOnJob (server job rows)", () => {
  const validUntil = at(400);

  it("BOOKED to EXPIRED once the activation window closed", () => {
    expect(nextStatusOnJob({ status: "BOOKED", validUntil: null }, window0, "RUNNING", at(30))).toBeNull();
    expect(nextStatusOnJob({ status: "BOOKED", validUntil: null }, window0, "RUNNING", at(31))).toBe("EXPIRED");
  });

  it("ACTIVE to EXPIRED after validUntil without a scan", () => {
    expect(nextStatusOnJob({ status: "ACTIVE", validUntil }, window0, "RUNNING", at(399))).toBeNull();
    expect(nextStatusOnJob({ status: "ACTIVE", validUntil }, window0, "RUNNING", at(401))).toBe("EXPIRED");
  });

  it("SCANNED to USED when the trip completed or validUntil passed", () => {
    expect(nextStatusOnJob({ status: "SCANNED", validUntil }, window0, "RUNNING", at(100))).toBeNull();
    expect(nextStatusOnJob({ status: "SCANNED", validUntil }, window0, "COMPLETED", at(100))).toBe("USED");
    expect(nextStatusOnJob({ status: "SCANNED", validUntil }, window0, "RUNNING", at(401))).toBe("USED");
  });

  it.each(["USED", "CANCELLED", "REFUNDED", "EXPIRED"] as TicketStatus[])("%s never changes by the job", (status) => {
    expect(nextStatusOnJob({ status, validUntil }, window0, "COMPLETED", at(1000))).toBeNull();
  });
});

describe("isUpcoming", () => {
  it("keeps live tickets until their last valid moment", () => {
    expect(isUpcoming({ status: "BOOKED", expiresAt: at(30), validUntil: null }, at(0))).toBe(true);
    expect(isUpcoming({ status: "BOOKED", expiresAt: at(30), validUntil: null }, at(31))).toBe(false);
    expect(isUpcoming({ status: "ACTIVE", expiresAt: at(30), validUntil: at(400) }, at(300))).toBe(true);
    expect(isUpcoming({ status: "CANCELLED", expiresAt: at(30), validUntil: null }, at(0))).toBe(false);
  });
});
