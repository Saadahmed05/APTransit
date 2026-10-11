import { generateKeyPairSync, randomBytes } from "node:crypto";
import { PLATFORM_TIME_ZONE } from "@aptransit/shared";

/** A complete, valid, fake environment for tests. Real secrets never appear in tests. */
export function testEnv(overrides: Record<string, string> = {}): Record<string, string> {
  const { privateKey } = generateKeyPairSync("ed25519");
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  return {
    NODE_ENV: "test",
    APP_ENV: "development",
    PORT: "4000",
    WEB_ORIGIN: "http://localhost:3000",
    DATABASE_URL: "postgresql://user:pass@127.0.0.1:5432/aptransit",
    DIRECT_URL: "postgresql://user:pass@127.0.0.1:5432/aptransit",
    REDIS_URL: "redis://127.0.0.1:6379",
    JWT_SECRET: "test-jwt-secret-that-is-long-enough-000000",
    OTP_PEPPER: "test-otp-pepper-0000",
    OTP_DEV_ECHO: "1",
    QR_SIGNING_PRIVATE_KEY: Buffer.from(pem).toString("base64"),
    QR_SIGNING_KEY_ID: "k1",
    QR_SECRET_KEY: randomBytes(32).toString("base64"),
    RAZORPAY_KEY_ID: "rzp_test_fake000000",
    RAZORPAY_KEY_SECRET: "fake-secret-000",
    RAZORPAY_WEBHOOK_SECRET: "fake-webhook-000",
    RESEND_API_KEY: "re_fake",
    EMAIL_FROM: "AP TransitOS <onboarding@resend.dev>",
    PAYMENTS_FAKE: "0",
    WORKER: "0",
    BULLMQ_DRAIN_DELAY_SEC: "60",
    TZ_DISPLAY: PLATFORM_TIME_ZONE,
    ...overrides,
  };
}
