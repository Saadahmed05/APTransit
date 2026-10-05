import { describe, expect, it } from "vitest";
import {
  canActivatePass,
  canCreatePass,
  isPassExpiringSoon,
  isPassLive,
  passActivateBy,
  passCoversService,
  passNextStatusOnJob,
  passValidity,
} from "./pass-rules";

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const now = new Date("2026-09-10T02:30:00.000Z"); // 08:00 IST

describe("passValidity", () => {
  it("weekly: activated 10 September 08:00 IST is valid until 17 September 08:00 IST", () => {
    const { validFrom, validUntil } = passValidity(now, 7);
    expect(validFrom).toEqual(now);
    expect(validUntil.toISOString()).toBe("2026-09-17T02:30:00.000Z");
  });

  it("monthly is 30 days", () => {
    expect(passValidity(now, 30).validUntil.getTime() - now.getTime()).toBe(30 * DAY);
  });

  it("free travel never outlives the eligibility check", () => {
    const eligibilityEnds = new Date(now.getTime() + 100 * DAY);
    expect(passValidity(now, 365, eligibilityEnds).validUntil).toEqual(eligibilityEnds);
    expect(passValidity(now, 7, eligibilityEnds).validUntil.getTime()).toBe(now.getTime() + 7 * DAY);
  });
});

describe("canCreatePass", () => {
  const eligible = { result: "ELIGIBLE" as const, expiresAt: new Date(now.getTime() + DAY) };

  it("paid kinds need no eligibility", () => {
    expect(canCreatePass("WEEKLY", null, false, now)).toEqual({ ok: true });
    expect(canCreatePass("MONTHLY", null, true, now)).toEqual({ ok: true });
  });

  it("free travel needs a current ELIGIBLE check", () => {
    expect(canCreatePass("FREE_TRAVEL", eligible, false, now)).toEqual({ ok: true });
    expect(canCreatePass("FREE_TRAVEL", null, false, now)).toEqual({ ok: false, error: "ELIGIBILITY_REQUIRED" });
    expect(canCreatePass("FREE_TRAVEL", { ...eligible, result: "NOT_ELIGIBLE" }, false, now)).toEqual({
      ok: false,
      error: "ELIGIBILITY_REQUIRED",
    });
    expect(canCreatePass("FREE_TRAVEL", { ...eligible, expiresAt: now }, false, now)).toEqual({ ok: false, error: "ELIGIBILITY_REQUIRED" });
  });

  it("only one open free travel pass", () => {
    expect(canCreatePass("FREE_TRAVEL", eligible, true, now)).toEqual({ ok: false, error: "PASS_ALREADY_ACTIVE" });
  });
});

describe("canActivatePass", () => {
  const ready = { status: "READY" as const, createdAt: new Date(now.getTime() - DAY) };

  it("activates a READY pass inside pass.activateWithinDays", () => {
    expect(canActivatePass(ready, 30, false, now)).toEqual({ ok: true });
  });

  it("refuses after activateBy", () => {
    const old = { ...ready, createdAt: new Date(now.getTime() - 31 * DAY) };
    expect(canActivatePass(old, 30, false, now)).toEqual({ ok: false, error: "PASS_NOT_ELIGIBLE" });
    expect(passActivateBy(old.createdAt, 30).getTime()).toBeLessThan(now.getTime());
  });

  it("one active pass per kind", () => {
    expect(canActivatePass(ready, 30, true, now)).toEqual({ ok: false, error: "PASS_ALREADY_ACTIVE" });
  });

  it("an ACTIVE pass reports already active; other states cannot activate", () => {
    expect(canActivatePass({ ...ready, status: "ACTIVE" }, 30, false, now)).toEqual({ ok: false, error: "PASS_ALREADY_ACTIVE" });
    for (const status of ["PENDING_PAYMENT", "EXPIRED", "CANCELLED"] as const) {
      expect(canActivatePass({ ...ready, status }, 30, false, now)).toEqual({ ok: false, error: "PASS_NOT_ELIGIBLE" });
    }
  });
});

describe("passNextStatusOnJob", () => {
  it("READY past activateBy expires", () => {
    expect(passNextStatusOnJob({ status: "READY", createdAt: new Date(now.getTime() - 31 * DAY), validUntil: null }, 30, now)).toBe("EXPIRED");
    expect(passNextStatusOnJob({ status: "READY", createdAt: new Date(now.getTime() - 29 * DAY), validUntil: null }, 30, now)).toBeNull();
  });

  it("ACTIVE past validUntil expires", () => {
    expect(passNextStatusOnJob({ status: "ACTIVE", createdAt: now, validUntil: new Date(now.getTime() - 1) }, 30, now)).toBe("EXPIRED");
    expect(passNextStatusOnJob({ status: "ACTIVE", createdAt: now, validUntil: new Date(now.getTime() + 1) }, 30, now)).toBeNull();
  });

  it("PENDING_PAYMENT older than 30 min is cancelled", () => {
    const pending = (minutesAgo: number) => ({ status: "PENDING_PAYMENT" as const, createdAt: new Date(now.getTime() - minutesAgo * MIN), validUntil: null });
    expect(passNextStatusOnJob(pending(31), 30, now)).toBe("CANCELLED");
    expect(passNextStatusOnJob(pending(29), 30, now)).toBeNull();
  });

  it("final states never change", () => {
    for (const status of ["EXPIRED", "CANCELLED"] as const) {
      expect(passNextStatusOnJob({ status, createdAt: new Date(0), validUntil: new Date(0) }, 30, now)).toBeNull();
    }
  });
});

describe("helpers", () => {
  it("passCoversService", () => {
    expect(passCoversService(["EXPRESS", "PALLEVELUGU"], "EXPRESS")).toBe(true);
    expect(passCoversService(["EXPRESS", "PALLEVELUGU"], "SUPER_LUXURY")).toBe(false);
  });

  it("isPassLive and isPassExpiringSoon", () => {
    const active = { status: "ACTIVE" as const, validUntil: new Date(now.getTime() + 23 * 60 * MIN) };
    expect(isPassLive(active, now)).toBe(true);
    expect(isPassExpiringSoon(active, now)).toBe(true);
    expect(isPassExpiringSoon({ ...active, validUntil: new Date(now.getTime() + 2 * DAY) }, now)).toBe(false);
    expect(isPassLive({ ...active, validUntil: new Date(now.getTime() - 1) }, now)).toBe(false);
    expect(isPassExpiringSoon({ ...active, status: "READY" }, now)).toBe(false);
  });
});
