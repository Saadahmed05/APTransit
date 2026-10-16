import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import type { RateLimitService } from "../../common/services/rate-limit.service";
import type { Env } from "../../config/env";
import type { PrismaService } from "../../prisma/prisma.service";
import type { RedisService } from "../../redis/redis.service";
import type { AuditService } from "../audit/audit.service";
import { AuthService } from "./auth.service";
import type { EmailProvider } from "./email.provider";

// v3 Phase 2, D-043: Sign in with Google. Google is never called: fetch is stubbed.

const CLIENT_ID = "123-abc.apps.googleusercontent.com";

interface FakeUser {
  id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  preferredLocale: string;
  deletedAt: Date | null;
  emailVerifiedAt?: Date | null;
  phoneVerifiedAt?: Date | null;
  userRoles: { id: string; userId: string; role: string; depotId: null; districtId: null; stateId: null }[];
}

function build(env: Partial<Record<keyof Env, unknown>> = {}) {
  const users: FakeUser[] = [];
  const audits: Record<string, unknown>[] = [];
  const prisma = {
    user: {
      findFirst: async ({ where }: { where: { email?: string } }) =>
        users.find((u) => u.email === where.email) ?? null,
      create: async ({ data }: { data: { email?: string; phone?: string; name?: string; userRoles: { create: { role: string }[] } } }) => {
        const id = `u${users.length + 1}`;
        const user: FakeUser = {
          id,
          email: data.email ?? null,
          phone: data.phone ?? null,
          name: data.name ?? null,
          preferredLocale: "en",
          deletedAt: null,
          userRoles: data.userRoles.create.map((r: { role: string }, i: number) => ({
            id: `r${i}`,
            userId: id,
            role: r.role,
            depotId: null,
            districtId: null,
            stateId: null,
          })),
        };
        users.push(user);
        return user;
      },
      // D-048: sign in stamps the verified time of the login channel
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeUser> }) => {
        const user = users.find((u) => u.id === where.id)!;
        Object.assign(user, data);
        return user;
      },
    },
    userRole: { create: async () => ({}) },
    refreshToken: { create: async () => ({}), findMany: async () => [], updateMany: async () => ({ count: 0 }) },
  } as unknown as PrismaService;
  const config = {
    get: (key: keyof Env) =>
      ({
        JWT_SECRET: "test_jwt_secret_at_least_32_chars_long!!",
        OTP_PEPPER: "pepper",
        GOOGLE_CLIENT_ID: CLIENT_ID,
        NODE_ENV: "test",
        ...env,
      })[key],
  } as unknown as ConfigService<Env, true>;
  const audit = { log: async (row: Record<string, unknown>) => void audits.push(row) } as unknown as AuditService;
  const service = new AuthService(
    prisma,
    { client: {} } as unknown as RedisService,
    config,
    {} as RateLimitService,
    audit,
    {} as EmailProvider,
  );
  return { service, users, audits };
}

const claims = (over: Record<string, unknown> = {}) => ({
  aud: CLIENT_ID,
  iss: "https://accounts.google.com",
  exp: String(Math.floor(Date.now() / 1000) + 3600),
  email_verified: "true",
  email: "rani@example.com",
  name: "Rani Devi",
  ...over,
});

const answer = (body: unknown, status = 200) =>
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => new Response(JSON.stringify(body), { status })),
  );

describe("AuthService.googleSignIn", () => {
  beforeEach(() => answer(claims()));
  afterEach(() => vi.unstubAllGlobals());

  it("creates a citizen with the Google name and writes an auth.login audit", async () => {
    const { service, users, audits } = build();
    const res = await service.googleSignIn("token", "1.2.3.4");
    expect(res.accessToken).toBeTruthy();
    expect(res.refreshToken).toBeTruthy();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ email: "rani@example.com", name: "Rani Devi" });
    expect(users[0]!.userRoles[0]!.role).toBe("CITIZEN");
    expect(audits[0]).toMatchObject({ action: "auth.login", after: { method: "google" } });
  });

  it("signs into the account that already exists for that email (no second user)", async () => {
    const { service, users } = build();
    await service.googleSignIn("token", "1.2.3.4");
    await service.googleSignIn("token", "1.2.3.4");
    expect(users).toHaveLength(1);
  });

  it("stores the email in lower case", async () => {
    answer(claims({ email: "Email@Example.COM" }));
    const { service, users } = build();
    await service.googleSignIn("token", "1.2.3.4");
    expect(users[0]!.email).toBe("email@example.com");
  });

  it.each([
    ["another client id", { aud: "999.apps.googleusercontent.com" }],
    ["an unverified email", { email_verified: "false" }],
    ["a wrong issuer", { iss: "https://evil.example.com" }],
    ["an expired token", { exp: String(Math.floor(Date.now() / 1000) - 60) }],
    ["no email", { email: undefined }],
  ])("refuses %s with 401", async (_name, over) => {
    answer(claims(over));
    const { service, users } = build();
    await expect(service.googleSignIn("token", "1.2.3.4")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    expect(users).toHaveLength(0);
  });

  it("answers 401, never 500, when tokeninfo says 400", async () => {
    answer({ error: "invalid_token" }, 400);
    await expect(build().service.googleSignIn("bad", "1.2.3.4")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("answers 401 when fetch throws or times out", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket hang up")));
    await expect(build().service.googleSignIn("t", "1.2.3.4")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")));
    await expect(build().service.googleSignIn("t", "1.2.3.4")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("answers 401 when tokeninfo returns something that is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 200 })));
    await expect(build().service.googleSignIn("t", "1.2.3.4")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("refuses a deleted account with 403", async () => {
    const { service, users } = build();
    await service.googleSignIn("token", "1.2.3.4");
    users[0]!.deletedAt = new Date();
    await expect(service.googleSignIn("token", "1.2.3.4")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("answers 403 before any fetch when GOOGLE_CLIENT_ID is not set", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(
      build({ GOOGLE_CLIENT_ID: undefined }).service.googleSignIn("token", "1.2.3.4"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
