/* eslint-disable @typescript-eslint/no-explicit-any */
import { ErrorResponse } from "@aptransit/shared";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureHttpApp } from "../src/http-app";
import { PrismaService } from "../src/prisma/prisma.service";
import { RedisService } from "../src/redis/redis.service";

describe("Auth endpoints and lifecycle", () => {
  let app: NestExpressApplication;

  // In-memory mock tables for auth testing
  const otpCodes: any[] = [];
  const users: any[] = [];
  const refreshTokens: any[] = [];
  const auditLogs: any[] = [];
  const redisStore = new Map<string, string>();

  beforeAll(async () => {
    const mockPrisma = {
      $queryRaw: async () => [1],
      otpCode: {
        create: async ({ data }: any) => {
          const rec = {
            id: `otp_${Date.now()}_${Math.random()}`,
            attempts: 0,
            consumedAt: null,
            createdAt: new Date(),
            ...data,
          };
          otpCodes.push(rec);
          return rec;
        },
        findFirst: async ({ where }: any) => {
          const matching = otpCodes.filter((o) => {
            if (where.target && o.target !== where.target) return false;
            if (where.channel && o.channel !== where.channel) return false;
            if (where.consumedAt === null && o.consumedAt !== null) return false;
            return true;
          });
          return matching[matching.length - 1] ?? null;
        },
        update: async ({ where, data }: any) => {
          const rec = otpCodes.find((o) => o.id === where.id);
          if (rec) {
            if (data.attempts?.increment) rec.attempts += data.attempts.increment;
            else Object.assign(rec, data);
          }
          return rec;
        },
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          for (const o of otpCodes) {
            if (o.id !== where.id) continue;
            if (where.consumedAt === null && o.consumedAt !== null) continue;
            Object.assign(o, data);
            count++;
          }
          return { count };
        },
      },
      user: {
        findFirst: async ({ where }: any) => {
          return (
            users.find((u) => {
              if (where.email && u.email?.toLowerCase() === where.email?.toLowerCase()) return true;
              if (where.phone && u.phone === where.phone) return true;
              return false;
            }) ?? null
          );
        },
        findUnique: async ({ where }: any) => {
          return users.find((u) => u.id === where.id) ?? null;
        },
        create: async ({ data }: any) => {
          const userRoles = (data.userRoles?.create ?? []).map((r: any) => ({
            id: `ur_${Date.now()}_${Math.random()}`,
            role: r.role,
            depotId: r.depotId ?? null,
            districtId: r.districtId ?? null,
          }));
          const u = {
            id: `usr_${Date.now()}_${Math.random()}`,
            name: data.name ?? null,
            email: data.email ?? null,
            phone: data.phone ?? null,
            preferredLocale: data.preferredLocale ?? "en",
            deletedAt: null,
            userRoles,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          users.push(u);
          return u;
        },
        update: async ({ where, data }: any) => {
          const u = users.find((x) => x.id === where.id);
          if (u) Object.assign(u, data);
          return u;
        },
      },
      userRole: {
        create: async ({ data }: any) => {
          const r = { id: `ur_${Date.now()}`, ...data };
          const u = users.find((x) => x.id === data.userId);
          if (u) u.userRoles.push(r);
          return r;
        },
      },
      refreshToken: {
        create: async ({ data }: any) => {
          const token = {
            id: `rt_${Date.now()}_${Math.random()}`,
            revokedAt: null,
            replacedById: null,
            ...data,
          };
          refreshTokens.push(token);
          return token;
        },
        findUnique: async ({ where }: any) => {
          return refreshTokens.find((t) => t.tokenHash === where.tokenHash) ?? null;
        },
        update: async ({ where, data }: any) => {
          const t = refreshTokens.find((x) => x.id === where.id);
          if (t) Object.assign(t, data);
          return t;
        },
        findMany: async ({ where }: any) =>
          refreshTokens.filter(
            (t) =>
              (!where.userId || t.userId === where.userId) &&
              (where.revokedAt !== null || t.revokedAt === null) &&
              (!where.expiresAt?.gt || t.expiresAt > where.expiresAt.gt),
          ),
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          for (const t of refreshTokens) {
            if (where.id && t.id !== where.id) continue;
            if (where.userId && t.userId !== where.userId) continue;
            if (typeof where.familyId === "string" && t.familyId !== where.familyId) continue;
            if (where.familyId?.in && !where.familyId.in.includes(t.familyId)) continue;
            if (where.revokedAt === null && t.revokedAt !== null) continue;
            Object.assign(t, data);
            count++;
          }
          return { count };
        },
      },
      auditLog: {
        create: async ({ data }: any) => {
          const log = { id: `audit_${Date.now()}`, ...data, createdAt: new Date() };
          auditLogs.push(log);
          return log;
        },
      },
      onModuleDestroy: async () => undefined,
    };

    const mockRedis = {
      client: {
        status: "ready",
        ping: async () => "PONG",
        // Same contract as the WINDOW_SCRIPT in redis-window.ts: [hits, ttlMs]
        eval: async (_script: string, _keys: number, key: string, windowMs: string) => {
          const val = Number(redisStore.get(key) ?? 0) + 1;
          redisStore.set(key, String(val));
          return [val, Number(windowMs)];
        },
        get: async (k: string) => redisStore.get(k) ?? null,
        set: async (k: string, v: string) => {
          redisStore.set(k, v);
          return "OK";
        },
        incr: async (k: string) => {
          const val = Number(redisStore.get(k) ?? 0) + 1;
          redisStore.set(k, String(val));
          return val;
        },
        expire: async () => 1,
        ttl: async () => 60,
      },
      onModuleDestroy: async () => undefined,
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .overrideProvider(RedisService)
      .useValue(mockRedis)
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureHttpApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("POST /auth/otp/request rejects invalid phone or email", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/otp/request")
      .send({ channel: "PHONE", target: "9876543210" });
    expect(res.status).toBe(400);
    const body = ErrorResponse.parse(res.body);
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  let devOtpCode: string;
  const testEmail = "citizen@aptransit.test";

  it("POST /auth/otp/request sends OTP and returns devCode in development", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/otp/request")
      .send({ channel: "EMAIL", target: testEmail });
    expect(res.status).toBe(202);
    expect(res.body.expiresInSec).toBe(300);
    expect(res.body.resendInSec).toBe(30);
    expect(res.body.devCode).toBeDefined();
    devOtpCode = res.body.devCode;
  });

  it("POST /auth/otp/verify rejects wrong code", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/otp/verify")
      .send({ channel: "EMAIL", target: testEmail, code: "000000" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("OTP_INVALID");
  });

  let accessToken: string;
  let refreshTokenCookie: string;

  it("POST /auth/otp/verify succeeds with correct code, returns tokens and sets cookie", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/otp/verify")
      .send({ channel: "EMAIL", target: testEmail, code: devOtpCode });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.email).toBe(testEmail);
    expect(res.body.user.roles[0].role).toBe("CITIZEN");

    accessToken = res.body.accessToken;
    const cookies = res.headers["set-cookie"] as string[] | undefined;
    expect(cookies).toBeDefined();
    refreshTokenCookie = cookies![0]!;
    expect(refreshTokenCookie).toContain("apt_rt=");
    expect(refreshTokenCookie).toContain("HttpOnly");

    // Audit log written
    const loginAudit = auditLogs.find((a) => a.action === "auth.login");
    expect(loginAudit).toBeDefined();
  });

  it("GET /me without authorization header returns 401 UNAUTHENTICATED", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("GET /me with valid access token returns user profile", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(testEmail);
    expect(res.body.roles).toHaveLength(1);
  });

  it("PATCH /me updates preferred locale and name", async () => {
    const res = await request(app.getHttpServer())
      .patch("/api/v1/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Ravi Kumar", preferredLocale: "te" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Ravi Kumar");
    expect(res.body.preferredLocale).toBe("te");
  });

  let secondRefreshTokenCookie: string;

  it("POST /auth/refresh rotates the refresh token", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Cookie", refreshTokenCookie);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();

    const cookies = res.headers["set-cookie"] as string[] | undefined;
    expect(cookies).toBeDefined();
    secondRefreshTokenCookie = cookies![0]!;
    expect(secondRefreshTokenCookie).toContain("apt_rt=");
  });

  it("reusing the old refresh token triggers reuse detection and revokes family", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Cookie", refreshTokenCookie);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");

    // Check reuse audit log
    const reuseAudit = auditLogs.find((a) => a.action === "auth.refresh_reuse_detected");
    expect(reuseAudit).toBeDefined();

    // Now even secondRefreshTokenCookie is revoked because entire family was revoked
    const res2 = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Cookie", secondRefreshTokenCookie);
    expect(res2.status).toBe(401);
  });

  it("POST /auth/logout clears cookie and revokes tokens", async () => {
    // Request a new session
    const reqRes = await request(app.getHttpServer())
      .post("/api/v1/auth/otp/request")
      .send({ channel: "EMAIL", target: testEmail });
    const code = reqRes.body.devCode;

    const verifyRes = await request(app.getHttpServer())
      .post("/api/v1/auth/otp/verify")
      .send({ channel: "EMAIL", target: testEmail, code });
    const cookies = verifyRes.headers["set-cookie"] as string[] | undefined;
    expect(cookies).toBeDefined();
    const cookie = cookies![0]!;

    const logoutRes = await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Cookie", cookie);
    expect(logoutRes.status).toBe(204);

    const logoutAudit = auditLogs.find((a) => a.action === "auth.logout");
    expect(logoutAudit).toBeDefined();
  });

  // Every test shares one client IP; keep the 10 per IP per hour limit out of unrelated tests.
  function resetIpLimit(): void {
    for (const key of [...redisStore.keys()]) {
      if (key.startsWith("ratelimit:otp:req:ip:")) redisStore.delete(key);
    }
  }

  function resetGoogleIpLimit(): void {
    for (const key of [...redisStore.keys()]) {
      if (key.startsWith("ratelimit:default:")) redisStore.delete(key);
    }
  }

  async function requestCode(target: string): Promise<string> {
    resetIpLimit();
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/otp/request")
      .send({ channel: "EMAIL", target });
    expect(res.status).toBe(202);
    return res.body.devCode as string;
  }

  function verify(target: string, code: string) {
    return request(app.getHttpServer())
      .post("/api/v1/auth/otp/verify")
      .send({ channel: "EMAIL", target, code });
  }

  it("refresh cookie carries the docs/06 attributes", async () => {
    const target = "cookie@aptransit.test";
    const res = await verify(target, await requestCode(target));
    const cookie = (res.headers["set-cookie"] as unknown as string[])[0]!;
    expect(cookie).toContain("Path=/api/v1/auth");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toMatch(/Max-Age=2592000/);
  });

  it("an email target is matched case insensitively", async () => {
    const code = await requestCode("Mixed.Case@APTransit.test");
    const res = await verify("mixed.case@aptransit.test", code);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("mixed.case@aptransit.test");
  });

  it("a code works only once", async () => {
    const target = "once@aptransit.test";
    const code = await requestCode(target);
    expect((await verify(target, code)).status).toBe(200);
    const again = await verify(target, code);
    expect(again.status).toBe(410);
    expect(again.body.error.code).toBe("OTP_EXPIRED");
  });

  it("parallel verifies with the same code log in only once", async () => {
    const target = "race@aptransit.test";
    const code = await requestCode(target);
    const results = await Promise.all([verify(target, code), verify(target, code)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 410]);
  });

  it("an expired code is refused with OTP_EXPIRED", async () => {
    const target = "late@aptransit.test";
    const code = await requestCode(target);
    otpCodes[otpCodes.length - 1].expiresAt = new Date(Date.now() - 1000);
    const res = await verify(target, code);
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe("OTP_EXPIRED");
  });

  it("5 wrong codes lock the target for 15 minutes", async () => {
    const target = "brute@aptransit.test";
    const code = await requestCode(target);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 1; i <= 4; i++) {
      expect((await verify(target, wrong)).body.error.code).toBe("OTP_INVALID");
    }
    const fifth = await verify(target, wrong);
    expect(fifth.body.error.code).toBe("OTP_TOO_MANY_ATTEMPTS");
    expect(redisStore.get(`otp:lock:${target}`)).toBe("1");

    resetIpLimit();
    const locked = await request(app.getHttpServer())
      .post("/api/v1/auth/otp/request")
      .send({ channel: "EMAIL", target });
    expect(locked.body.error.code).toBe("OTP_TOO_MANY_ATTEMPTS");
  });

  it("the 4th code request for one target in 10 minutes gets 429 with Retry-After", async () => {
    const target = "spam@aptransit.test";
    for (let i = 0; i < 3; i++) await requestCode(target);
    resetIpLimit();
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/otp/request")
      .send({ channel: "EMAIL", target });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("two refreshes racing with one token rotate it only once", async () => {
    const target = "tabs@aptransit.test";
    const login = await verify(target, await requestCode(target));
    const cookie = (login.headers["set-cookie"] as unknown as string[])[0]!;

    const results = await Promise.all([
      request(app.getHttpServer()).post("/api/v1/auth/refresh").set("Cookie", cookie),
      request(app.getHttpServer()).post("/api/v1/auth/refresh").set("Cookie", cookie),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
  });

  it("a failed refresh clears the cookie", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Cookie", "apt_rt=not-a-real-token");
    expect(res.status).toBe(401);
    const cookie = (res.headers["set-cookie"] as unknown as string[])[0]!;
    expect(cookie).toMatch(/^apt_rt=;/);
    const marker = (res.headers["set-cookie"] as unknown as string[]).find((c) =>
      c.startsWith("apt_session="),
    );
    expect(marker).toMatch(/^apt_session=;.*Path=\//);
  });

  it("login sets the apt_session marker for the web guard (D-016)", async () => {
    const target = "marker@aptransit.test";
    const res = await verify(target, await requestCode(target));
    const marker = (res.headers["set-cookie"] as unknown as string[]).find((c) =>
      c.startsWith("apt_session="),
    )!;
    expect(marker).toMatch(/^apt_session=1;/);
    expect(marker).toContain("Path=/;");
    expect(marker).toContain("HttpOnly");
    expect(marker).toContain("SameSite=Lax");
    expect(marker).toMatch(/Max-Age=2592000/);
  });

  it("refresh without a refresh cookie clears a stale marker", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Cookie", "apt_session=1");
    expect(res.status).toBe(401);
    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies.some((c) => /^apt_session=;/.test(c))).toBe(true);
  });

  it("a soft deleted user cannot refresh", async () => {
    const target = "gone@aptransit.test";
    const login = await verify(target, await requestCode(target));
    const cookie = (login.headers["set-cookie"] as unknown as string[])[0]!;
    users.find((u) => u.email === target).deletedAt = new Date();

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Cookie", cookie);
    expect(res.status).toBe(401);
  });

  it("a citizen sign in on a second device signs the first device out (D-051)", async () => {
    const target = "onedevice@aptransit.test";
    const first = await verify(target, await requestCode(target));
    const firstCookie = (first.headers["set-cookie"] as unknown as string[])[0]!;
    const second = await verify(target, await requestCode(target));
    expect(second.status).toBe(200);

    const oldMe = await request(app.getHttpServer()).get("/api/v1/me").set("Authorization", `Bearer ${first.body.accessToken}`);
    expect(oldMe.status).toBe(401);
    expect(oldMe.body.error.code).toBe("SESSION_REPLACED");
    const oldRefresh = await request(app.getHttpServer()).post("/api/v1/auth/refresh").set("Cookie", firstCookie);
    expect(oldRefresh.status).toBe(401);
    expect(oldRefresh.body.error.code).toBe("SESSION_REPLACED");
    // Not treated as a stolen token
    expect(auditLogs.some((a) => a.action === "auth.single_device")).toBe(true);

    const newMe = await request(app.getHttpServer()).get("/api/v1/me").set("Authorization", `Bearer ${second.body.accessToken}`);
    expect(newMe.status).toBe(200);
  });

  it("logged in routes report the default rate limit", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.headers["x-ratelimit-limit"]).toBe("120");
  });

  it("POST /auth/google validates the body and answers 403 when Google is not set up (D-043)", async () => {
    const bad = await request(app.getHttpServer()).post("/api/v1/auth/google").send({});
    expect(bad.status).toBe(400);
    const off = await request(app.getHttpServer())
      .post("/api/v1/auth/google")
      .send({ credential: "x".repeat(40) });
    expect(off.status).toBe(403);
    expect(ErrorResponse.parse(off.body).error.code).toBe("FORBIDDEN");

    // Phase 2: the limit is 10 per IP per minute. Two requests are used above, so 8 more pass and
    // the 11th request on this route is refused.
    const send = () =>
      request(app.getHttpServer())
        .post("/api/v1/auth/google")
        .send({ credential: "x".repeat(40) });
    for (let i = 0; i < 8; i++) expect((await send()).status).toBe(403);
    const limited = await send();
    expect(limited.status).toBe(429);
    expect(ErrorResponse.parse(limited.body).error.code).toBe("RATE_LIMITED");
  });

  it("POST /auth/google limits one IP to 10 requests per minute", async () => {
    resetGoogleIpLimit();
    const responses = [];
    for (let requestNo = 1; requestNo <= 11; requestNo++) {
      responses.push(
        await request(app.getHttpServer())
          .post("/api/v1/auth/google")
          .send({ credential: "x".repeat(40) }),
      );
    }
    expect(responses.slice(0, 10).every((response) => response.status === 403)).toBe(true);
    expect(responses[10]?.status).toBe(429);
    expect(ErrorResponse.parse(responses[10]?.body).error.code).toBe("RATE_LIMITED");
  });
});
