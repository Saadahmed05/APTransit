import { describe, expect, it } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import type { RateLimitService } from "../../common/services/rate-limit.service";
import type { Env } from "../../config/env";
import type { PrismaService } from "../../prisma/prisma.service";
import type { RedisService } from "../../redis/redis.service";
import type { AuditService } from "../audit/audit.service";
import { AuthService } from "./auth.service";
import type { EmailProvider } from "./email.provider";

// D-048 Phase 3: profile completion, contact codes, notification preferences and signed in devices.

interface FakeUser {
  id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  preferredLocale: string;
  deletedAt: Date | null;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  notificationPrefs: unknown;
  userRoles: { role: string; depotId: null; districtId: null; stateId: null }[];
}
interface FakeOtp {
  id: string;
  channel: string;
  target: string;
  purpose: string;
  codeHash: string;
  attempts: number;
  consumedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}
interface FakeToken {
  tokenHash: string;
  familyId: string;
  userId: string;
  userAgent: string | null;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

const PEPPER = "pepper";
const hashCode = (code: string) => createHash("sha256").update(code + PEPPER).digest("hex");
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

function user(over: Partial<FakeUser> = {}): FakeUser {
  return {
    id: "u1",
    email: "rani@example.com",
    phone: null,
    name: "Rani Devi",
    preferredLocale: "en",
    deletedAt: null,
    emailVerifiedAt: new Date(),
    phoneVerifiedAt: null,
    notificationPrefs: null,
    userRoles: [{ role: "CITIZEN", depotId: null, districtId: null, stateId: null }],
    ...over,
  };
}

function build(users: FakeUser[], env: Partial<Record<keyof Env, unknown>> = {}, tokens: FakeToken[] = []) {
  const otps: FakeOtp[] = [];
  const sent: { to: string; text: string }[] = [];
  const audits: Record<string, unknown>[] = [];
  const byWhere = (where: { email?: string; phone?: string }) =>
    users.find((u) => (where.email !== undefined && u.email === where.email) || (where.phone !== undefined && u.phone === where.phone)) ?? null;
  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => users.find((u) => u.id === where.id) ?? null,
      findFirst: async ({ where }: { where: { email?: string; phone?: string } }) => byWhere(where),
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeUser> }) => {
        const u = users.find((x) => x.id === where.id)!;
        const clash = (data.email && users.some((x) => x.id !== u.id && x.email === data.email)) || (data.phone && users.some((x) => x.id !== u.id && x.phone === data.phone));
        if (clash) throw Object.assign(new Error("unique"), { code: "P2002" });
        Object.assign(u, data);
        return u;
      },
    },
    otpCode: {
      create: async ({ data }: { data: Pick<FakeOtp, "channel" | "target" | "purpose" | "codeHash" | "expiresAt"> }) => {
        const row: FakeOtp = { id: `o${otps.length + 1}`, attempts: 0, consumedAt: null, createdAt: new Date(otps.length), ...data };
        otps.push(row);
        return row;
      },
      findFirst: async ({ where }: { where: Pick<FakeOtp, "channel" | "target" | "purpose"> }) =>
        [...otps].reverse().find((o) => o.channel === where.channel && o.target === where.target && o.purpose === where.purpose && !o.consumedAt) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: { attempts: { increment: number } } }) => {
        const o = otps.find((x) => x.id === where.id)!;
        o.attempts += data.attempts.increment;
        return { attempts: o.attempts };
      },
      updateMany: async ({ where }: { where: { id: string } }) => {
        const o = otps.find((x) => x.id === where.id && !x.consumedAt);
        if (o) o.consumedAt = new Date();
        return { count: o ? 1 : 0 };
      },
    },
    refreshToken: {
      findMany: async ({ where }: { where: { userId: string } }) => tokens.filter((t) => t.userId === where.userId && !t.revokedAt && t.expiresAt > new Date()),
      groupBy: async ({ where }: { where: { familyId: { in: string[] } } }) =>
        where.familyId.in.map((familyId) => ({
          familyId,
          _min: { createdAt: new Date(Math.min(...tokens.filter((t) => t.familyId === familyId).map((t) => t.createdAt.getTime()))) },
        })),
      findUnique: async ({ where }: { where: { tokenHash: string } }) => tokens.find((t) => t.tokenHash === where.tokenHash) ?? null,
      updateMany: async ({ where }: { where: { userId: string; familyId?: { not: string } } }) => {
        const hit = tokens.filter((t) => t.userId === where.userId && !t.revokedAt && (!where.familyId || t.familyId !== where.familyId.not));
        hit.forEach((t) => (t.revokedAt = new Date()));
        return { count: hit.length };
      },
    },
  } as unknown as PrismaService;
  const config = {
    get: (key: keyof Env) =>
      ({
        JWT_SECRET: "test_jwt_secret_at_least_32_chars_long!!",
        OTP_PEPPER: PEPPER,
        NODE_ENV: "test",
        APP_ENV: "development",
        OTP_DEV_ECHO: true,
        ...env,
      })[key],
  } as unknown as ConfigService<Env, true>;
  const email: EmailProvider = { sendEmail: async (to: string, _subject: string, text: string) => void sent.push({ to, text }) } as unknown as EmailProvider;
  const rateLimit = { assertOtpRequestLimit: async () => undefined, assertOtpVerifyLimit: async () => undefined } as unknown as RateLimitService;
  const audit = { log: async (row: Record<string, unknown>) => void audits.push(row) } as unknown as AuditService;
  const service = new AuthService(prisma, { client: { get: async () => null, set: async () => "OK" } } as unknown as RedisService, config, rateLimit, audit, email);
  return { service, users, otps, sent, audits, tokens };
}

const codeOf = (res: { devCode?: string }) => res.devCode!;

describe("profile completion", () => {
  it("lists what is missing: a name and one verified contact", async () => {
    const { service } = build([user({ name: null, email: null, emailVerifiedAt: null })]);
    const me = await service.getMe("u1");
    expect(me.profileComplete).toBe(false);
    expect(me.missing).toEqual(["name", "email"]);
  });

  it("an email that is stored but never verified does not count as a contact", async () => {
    const { service } = build([user({ emailVerifiedAt: null })]);
    expect((await service.getMe("u1")).missing).toEqual(["email"]);
  });

  it("is complete with a name and a verified email only, a second contact is optional", async () => {
    const { service } = build([user()]);
    expect(await service.getMe("u1")).toMatchObject({ profileComplete: true, missing: [] });
  });

  it("is complete with a name, a verified email and a verified phone", async () => {
    const { service } = build([user({ phone: "+919876543210", phoneVerifiedAt: new Date() })]);
    const me = await service.getMe("u1");
    expect(me).toMatchObject({ profileComplete: true, missing: [], emailVerified: true, phoneVerified: true });
    expect(me.phone).not.toBe("+919876543210");
  });

  it("an unverified phone is enough when this environment cannot send phone codes", async () => {
    const { service } = build([user({ phone: "+919876543210" })], { APP_ENV: "production", OTP_DEV_ECHO: false });
    expect((await service.getMe("u1")).profileComplete).toBe(true);
  });

  it("hides a deleted account", async () => {
    const { service } = build([user({ deletedAt: new Date() })]);
    await expect(service.getMe("u1")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("updateMe", () => {
  it("saves the name and trims nothing else, then clears the missing name", async () => {
    const { service } = build([user({ name: null, phone: "+919876543210", phoneVerifiedAt: new Date() })]);
    const me = await service.updateMe("u1", { name: "Rani Devi" });
    expect(me.name).toBe("Rani Devi");
    expect(me.profileComplete).toBe(true);
  });

  it("stores notification preferences and reads them back", async () => {
    const { service } = build([user()]);
    const prefs = { email: { trips: false, tickets: true, passes: true, complaints: false } };
    const me = await service.updateMe("u1", { notificationPrefs: prefs });
    expect(me.notificationPrefs).toEqual(prefs);
    expect((await service.getMe("u1")).notificationPrefs).toEqual(prefs);
  });

  it("falls back to all on for a user who never chose", async () => {
    const { service } = build([user()]);
    expect((await service.getMe("u1")).notificationPrefs.email).toEqual({ trips: true, tickets: true, passes: true, complaints: true });
  });
});

describe("contact codes", () => {
  it("a right code verifies and stores the new email, and writes an audit row", async () => {
    const { service, users, sent, audits } = build([user({ email: null, emailVerifiedAt: null })]);
    const res = await service.requestContactOtp("u1", { channel: "EMAIL", target: "New@Example.com" }, "1.2.3.4");
    expect(res.saved).toBe(false);
    expect(sent[0]!.to).toBe("new@example.com");
    const me = await service.verifyContactOtp("u1", { channel: "EMAIL", target: "new@example.com", code: codeOf(res) }, "1.2.3.4");
    expect(users[0]).toMatchObject({ email: "new@example.com" });
    expect(users[0]!.emailVerifiedAt).toBeInstanceOf(Date);
    expect(me.emailVerified).toBe(true);
    expect(audits[0]).toMatchObject({ action: "user.contact_verify", after: { field: "email" } });
  });

  it("a wrong code is refused and leaves the email unchanged", async () => {
    const { service, users } = build([user({ email: null, emailVerifiedAt: null })]);
    const res = await service.requestContactOtp("u1", { channel: "EMAIL", target: "new@example.com" }, "1.2.3.4");
    const wrong = codeOf(res) === "000000" ? "111111" : "000000";
    await expect(service.verifyContactOtp("u1", { channel: "EMAIL", target: "new@example.com", code: wrong }, "1.2.3.4")).rejects.toMatchObject({ code: "OTP_INVALID" });
    expect(users[0]!.email).toBeNull();
  });

  it("a code cannot be used twice", async () => {
    const { service } = build([user({ email: null, emailVerifiedAt: null })]);
    const res = await service.requestContactOtp("u1", { channel: "EMAIL", target: "new@example.com" }, "1.2.3.4");
    const input = { channel: "EMAIL" as const, target: "new@example.com", code: codeOf(res) };
    await service.verifyContactOtp("u1", input, "1.2.3.4");
    await expect(service.verifyContactOtp("u1", input, "1.2.3.4")).rejects.toMatchObject({ code: "OTP_EXPIRED" });
  });

  it("a code asked by one account does not work for another", async () => {
    const { service, otps } = build([user({ email: null, emailVerifiedAt: null }), user({ id: "u2", email: "b@example.com" })]);
    const res = await service.requestContactOtp("u1", { channel: "EMAIL", target: "new@example.com" }, "1.2.3.4");
    expect(otps[0]!.purpose).toBe("CONTACT:u1");
    await expect(service.verifyContactOtp("u2", { channel: "EMAIL", target: "new@example.com", code: codeOf(res) }, "1.2.3.4")).rejects.toMatchObject({ code: "OTP_EXPIRED" });
  });

  it("an expired code is refused", async () => {
    const { service, otps } = build([user({ email: null, emailVerifiedAt: null })]);
    const res = await service.requestContactOtp("u1", { channel: "EMAIL", target: "new@example.com" }, "1.2.3.4");
    otps[0]!.expiresAt = new Date(Date.now() - 1000);
    await expect(service.verifyContactOtp("u1", { channel: "EMAIL", target: "new@example.com", code: codeOf(res) }, "1.2.3.4")).rejects.toMatchObject({ code: "OTP_EXPIRED" });
  });

  it("refuses a contact that belongs to another account, before any code is sent", async () => {
    const { service, sent } = build([user(), user({ id: "u2", email: "taken@example.com", phone: "+919876543210" })]);
    await expect(service.requestContactOtp("u1", { channel: "EMAIL", target: "taken@example.com" }, "1.2.3.4")).rejects.toMatchObject({ code: "CONTACT_IN_USE" });
    await expect(service.requestContactOtp("u1", { channel: "PHONE", target: "+919876543210" }, "1.2.3.4")).rejects.toMatchObject({ code: "CONTACT_IN_USE" });
    expect(sent).toHaveLength(0);
  });

  it("refuses to re-verify the contact that is already verified", async () => {
    const { service } = build([user()]);
    await expect(service.requestContactOtp("u1", { channel: "EMAIL", target: "rani@example.com" }, "1.2.3.4")).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("an address taken after the code was sent answers CONTACT_IN_USE at verify", async () => {
    const { service, users } = build([user({ email: null, emailVerifiedAt: null })]);
    const res = await service.requestContactOtp("u1", { channel: "EMAIL", target: "race@example.com" }, "1.2.3.4");
    users.push(user({ id: "u2", email: "race@example.com" }));
    await expect(service.verifyContactOtp("u1", { channel: "EMAIL", target: "race@example.com", code: codeOf(res) }, "1.2.3.4")).rejects.toMatchObject({ code: "CONTACT_IN_USE" });
  });

  it("a phone is stored unverified, with no code, when phone codes cannot be sent", async () => {
    const { service, users, otps } = build([user()], { APP_ENV: "production", OTP_DEV_ECHO: false });
    const res = await service.requestContactOtp("u1", { channel: "PHONE", target: "+919876543210" }, "1.2.3.4");
    expect(res).toMatchObject({ saved: true, expiresInSec: 0 });
    expect(otps).toHaveLength(0);
    expect(users[0]).toMatchObject({ phone: "+919876543210", phoneVerifiedAt: null });
  });

  it("a phone is verified by a code in development", async () => {
    const { service, users } = build([user()]);
    const res = await service.requestContactOtp("u1", { channel: "PHONE", target: "+919876543210" }, "1.2.3.4");
    expect(res.saved).toBe(false);
    const me = await service.verifyContactOtp("u1", { channel: "PHONE", target: "+919876543210", code: codeOf(res) }, "1.2.3.4");
    expect(me.phoneVerified).toBe(true);
    expect(users[0]!.phone).toBe("+919876543210");
  });

  it("does not echo the code outside development echo", async () => {
    const { service } = build([user({ email: null, emailVerifiedAt: null })], { OTP_DEV_ECHO: false, APP_ENV: "staging" });
    const res = await service.requestContactOtp("u1", { channel: "EMAIL", target: "new@example.com" }, "1.2.3.4");
    expect(res.devCode).toBeUndefined();
  });

  it("stores only a hash of the code", async () => {
    const { service, otps } = build([user({ email: null, emailVerifiedAt: null })]);
    const res = await service.requestContactOtp("u1", { channel: "EMAIL", target: "new@example.com" }, "1.2.3.4");
    expect(otps[0]!.codeHash).toBe(hashCode(codeOf(res)));
    expect(JSON.stringify(otps)).not.toContain(codeOf(res));
  });
});

describe("signed in devices", () => {
  const day = 86_400_000;
  const tok = (over: Partial<FakeToken>): FakeToken => ({
    tokenHash: hashToken("x"),
    familyId: "f1",
    userId: "u1",
    userAgent: "Chrome",
    createdAt: new Date(Date.now() - day),
    expiresAt: new Date(Date.now() + day),
    revokedAt: null,
    ...over,
  });
  const authed = { id: "u1", roles: [{ role: "CITIZEN" }] } as never;

  it("lists one row per device and marks the current one", async () => {
    const tokens = [
      tok({ tokenHash: hashToken("a"), familyId: "f1", createdAt: new Date(Date.now() - 2 * day) }),
      tok({ tokenHash: hashToken("b"), familyId: "f1", createdAt: new Date(Date.now() - 1000) }),
      tok({ tokenHash: hashToken("c"), familyId: "f2", userAgent: "Android" }),
    ];
    const { service } = build([user()], {}, tokens);
    const rows = await service.sessions("u1", "b");
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === "f1")).toMatchObject({ current: true, userAgent: "Chrome" });
    expect(rows.find((r) => r.id === "f2")!.current).toBe(false);
  });

  it("does not list revoked or expired devices, or another user's", async () => {
    const tokens = [
      tok({ tokenHash: hashToken("a"), familyId: "f1", revokedAt: new Date() }),
      tok({ tokenHash: hashToken("b"), familyId: "f2", expiresAt: new Date(Date.now() - 1000) }),
      tok({ tokenHash: hashToken("c"), familyId: "f3", userId: "u2" }),
    ];
    const { service } = build([user()], {}, tokens);
    expect(await service.sessions("u1")).toEqual([]);
  });

  it("revoke others keeps only the device that asked, and writes an audit row", async () => {
    const tokens = [
      tok({ tokenHash: hashToken("a"), familyId: "f1" }),
      tok({ tokenHash: hashToken("b"), familyId: "f2" }),
      tok({ tokenHash: hashToken("c"), familyId: "f3" }),
    ];
    const { service, audits } = build([user()], {}, tokens);
    expect(await service.revokeOtherSessions(authed, "a", "1.2.3.4")).toBe(2);
    expect(tokens.map((t) => !!t.revokedAt)).toEqual([false, true, true]);
    expect(audits[0]).toMatchObject({ action: "auth.logout_others", after: { revoked: 2 } });
  });

  it("a refresh token from another account does not protect any device", async () => {
    const tokens = [tok({ tokenHash: hashToken("a"), familyId: "f1" }), tok({ tokenHash: hashToken("z"), familyId: "f9", userId: "u2" })];
    const { service } = build([user()], {}, tokens);
    expect(await service.revokeOtherSessions(authed, "z")).toBe(1);
    expect(tokens[1]!.revokedAt).toBeNull();
  });
});
