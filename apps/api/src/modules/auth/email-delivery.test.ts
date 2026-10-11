import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import type { RateLimitService } from "../../common/services/rate-limit.service";
import type { Env } from "../../config/env";
import type { PrismaService } from "../../prisma/prisma.service";
import type { RedisService } from "../../redis/redis.service";
import type { AuditService } from "../audit/audit.service";
import { AuthService } from "./auth.service";
import { deliveryFailed, type EmailProvider, ResendEmailProvider } from "./email.provider";

// D-041: a login email that Resend refuses answers 503 EMAIL_DELIVERY_FAILED, not a 500.

const configOf = (values: Partial<Record<keyof Env, unknown>>) =>
  ({
    get: (key: keyof Env) =>
      ({ JWT_SECRET: "test_jwt_secret_at_least_32_chars_long!!", OTP_PEPPER: "pepper", RESEND_API_KEY: "re_test", EMAIL_FROM: "AP TransitOS <login@example.in>", NODE_ENV: "production", ...values })[key],
  }) as unknown as ConfigService<Env, true>;

describe("ResendEmailProvider delivery failures", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("turns a refused send (for example an unverified sender) into 503 EMAIL_DELIVERY_FAILED", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 403 })));
    const provider = new ResendEmailProvider(configOf({ APP_ENV: "staging" }));
    await expect(provider.sendEmail("someone@gmail.com", "Code", "123456")).rejects.toMatchObject({
      code: "EMAIL_DELIVERY_FAILED",
      status: 503,
    });
  });

  it("turns a network failure into the same error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket hang up")));
    const provider = new ResendEmailProvider(configOf({ APP_ENV: "staging" }));
    await expect(provider.sendEmail("someone@gmail.com", "Code", "123456")).rejects.toMatchObject({ code: "EMAIL_DELIVERY_FAILED" });
  });

  it("sends from EMAIL_FROM when Resend accepts", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await new ResendEmailProvider(configOf({ APP_ENV: "staging" })).sendEmail("someone@gmail.com", "Code", "123456");
    expect(JSON.parse(fetch.mock.calls[0]![1].body as string)).toMatchObject({ from: "AP TransitOS <login@example.in>", to: ["someone@gmail.com"] });
  });
});

describe("AuthService.requestOtp when the email fails", () => {
  const service = (env: Partial<Record<keyof Env, unknown>>, provider: EmailProvider) =>
    new AuthService(
      { otpCode: { create: vi.fn().mockResolvedValue({}) } } as unknown as PrismaService,
      { client: { get: vi.fn().mockResolvedValue(null) } } as unknown as RedisService,
      configOf(env),
      { assertOtpRequestLimit: vi.fn().mockResolvedValue(undefined) } as unknown as RateLimitService,
      {} as AuditService,
      provider,
    );
  const failing: EmailProvider = { sendEmail: vi.fn().mockRejectedValue(deliveryFailed()) };
  const input = { channel: "EMAIL" as const, target: "someone@gmail.com" };

  it("answers 503 EMAIL_DELIVERY_FAILED without the test code echo", async () => {
    await expect(service({ APP_ENV: "staging", OTP_DEV_ECHO: false }, failing).requestOtp(input, "1.2.3.4")).rejects.toMatchObject({
      code: "EMAIL_DELIVERY_FAILED",
      status: 503,
    });
  });

  it("never falls back to the screen code in production", async () => {
    await expect(service({ APP_ENV: "production", OTP_DEV_ECHO: true }, failing).requestOtp(input, "1.2.3.4")).rejects.toMatchObject({
      code: "EMAIL_DELIVERY_FAILED",
    });
  });

  it("still logs a tester in with OTP_DEV_ECHO on staging: the code is on screen", async () => {
    const res = await service({ APP_ENV: "staging", OTP_DEV_ECHO: true }, failing).requestOtp(input, "1.2.3.4");
    expect(res.devCode).toMatch(/^\d{6}$/);
  });

  it("does not hide other failures behind the echo", async () => {
    const broken: EmailProvider = { sendEmail: vi.fn().mockRejectedValue(new Error("bug")) };
    await expect(service({ APP_ENV: "staging", OTP_DEV_ECHO: true }, broken).requestOtp(input, "1.2.3.4")).rejects.toThrow("bug");
  });
});
