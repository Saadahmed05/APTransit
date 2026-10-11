import { describe, expect, it } from "vitest";
import {
  canActivatePass,
  canCreatePass,
  endOfIstDay,
  isPassExpiringSoon,
  isPassLive,
  passActivateBy,
  passCoversService,
  passGroupFull,
  passNextStatusOnJob,
  passRouteCovered,
  passValidity,
} from "./pass-rules";

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const now = new Date("2026-09-10T02:30:00.000Z"); // 08:00 IST

const rolling = (durationDays: number) => ({ validityMode: "ROLLING_DAYS" as const, durationDays });
const dayPass = { validityMode: "UNTIL_DAY_END" as const, durationDays: 1 };

describe("passValidity", () => {
  it("weekly: activated 10 September 08:00 IST is valid until 17 September 08:00 IST", () => {
    const { validFrom, validUntil } = passValidity(now, rolling(7));
    expect(validFrom).toEqual(now);
    expect(validUntil.toISOString()).toBe("2026-09-17T02:30:00.000Z");
  });

  it("validity starts at activation, not at purchase: bought Sunday 10:00, activated Sunday 12:00, ends next Sunday 12:00", () => {
    const activatedSunday = new Date("2026-09-13T06:30:00.000Z"); // Sunday 12:00 IST
    expect(passValidity(activatedSunday, rolling(7)).validUntil.toISOString()).toBe("2026-09-20T06:30:00.000Z");
  });

  it("monthly is 30 days, annual 365", () => {
    expect(passValidity(now, rolling(30)).validUntil.getTime() - now.getTime()).toBe(30 * DAY);
    expect(passValidity(now, rolling(365)).validUntil.getTime() - now.getTime()).toBe(365 * DAY);
  });

  it("DAY pass ends at 23:59:59 IST of the activation day", () => {
    expect(passValidity(now, dayPass).validUntil.toISOString()).toBe("2026-09-10T18:29:59.000Z");
    // Activated at 23:30 IST: still the same IST day, 29 minutes 59 seconds left
    const late = new Date("2026-09-10T18:00:00.000Z");
    expect(passValidity(late, dayPass).validUntil.toISOString()).toBe("2026-09-10T18:29:59.000Z");
    // Activated 00:10 IST on the 11th (18:40 UTC on the 10th): ends on the 11th
    const afterMidnight = new Date("2026-09-10T18:40:00.000Z");
    expect(passValidity(afterMidnight, dayPass).validUntil.toISOString()).toBe("2026-09-11T18:29:59.000Z");
    expect(endOfIstDay(now).toISOString()).toBe("2026-09-10T18:29:59.000Z");
  });

  it("a scheme pass never outlives the eligibility check", () => {
    const eligibilityEnds = new Date(now.getTime() + 100 * DAY);
    expect(passValidity(now, rolling(365), eligibilityEnds).validUntil).toEqual(eligibilityEnds);
    expect(passValidity(now, rolling(7), eligibilityEnds).validUntil.getTime()).toBe(now.getTime() + 7 * DAY);
  });
});

describe("canCreatePass", () => {
  const eligible = { result: "ELIGIBLE" as const, expiresAt: new Date(now.getTime() + DAY) };
  const type = (kind: "WEEKLY" | "MONTHLY" | "FREE_TRAVEL" | "SCHOOL" | "FAMILY", scheme: "STREE_SHAKTI" | "STUDENT" | null = null, routeRestricted = false) => ({
    kind,
    scheme,
    routeRestricted,
  });
  const free = type("FREE_TRAVEL", "STREE_SHAKTI");
  const school = type("SCHOOL", "STUDENT", true);

  it("paid kinds without a scheme need no eligibility", () => {
    expect(canCreatePass(type("WEEKLY"), null, false, false, now)).toEqual({ ok: true });
    expect(canCreatePass(type("MONTHLY"), null, true, false, now)).toEqual({ ok: true });
    expect(canCreatePass(type("FAMILY"), null, false, false, now)).toEqual({ ok: true });
  });

  it("free travel needs a current ELIGIBLE check", () => {
    expect(canCreatePass(free, eligible, false, false, now)).toEqual({ ok: true });
    expect(canCreatePass(free, null, false, false, now)).toEqual({ ok: false, error: "ELIGIBILITY_REQUIRED" });
    expect(canCreatePass(free, { ...eligible, result: "NOT_ELIGIBLE" }, false, false, now)).toEqual({
      ok: false,
      error: "ELIGIBILITY_REQUIRED",
    });
    expect(canCreatePass(free, { ...eligible, expiresAt: now }, false, false, now)).toEqual({ ok: false, error: "ELIGIBILITY_REQUIRED" });
  });

  it("only one open free travel pass", () => {
    expect(canCreatePass(free, eligible, true, false, now)).toEqual({ ok: false, error: "PASS_ALREADY_ACTIVE" });
  });

  it("school needs a STUDENT check and both stops", () => {
    expect(canCreatePass(school, eligible, false, true, now)).toEqual({ ok: true });
    expect(canCreatePass(school, null, false, true, now)).toEqual({ ok: false, error: "ELIGIBILITY_REQUIRED" });
    expect(canCreatePass(school, eligible, false, false, now)).toEqual({ ok: false, error: "VALIDATION_FAILED" });
    expect(canCreatePass(type("WEEKLY"), null, false, true, now)).toEqual({ ok: false, error: "VALIDATION_FAILED" });
  });
});

describe("group and route rules (D-036)", () => {
  it("a pass boards at most groupSize people per trip", () => {
    expect(passGroupFull(0, 1)).toBe(false);
    expect(passGroupFull(1, 1)).toBe(true);
    expect(passGroupFull(3, 4)).toBe(false);
    expect(passGroupFull(4, 4)).toBe(true);
  });

  it("a route restricted pass needs both of its stops on the route", () => {
    const route = new Set(["home", "mid", "school"]);
    expect(passRouteCovered({ homeStopId: "home", destStopId: "school" }, route)).toBe(true);
    expect(passRouteCovered({ homeStopId: "home", destStopId: "elsewhere" }, route)).toBe(false);
    expect(passRouteCovered({ homeStopId: null, destStopId: null }, new Set())).toBe(true);
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
