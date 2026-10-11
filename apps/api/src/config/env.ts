import { PLATFORM_TIME_ZONE } from "@aptransit/shared";
import { createPrivateKey } from "node:crypto";
import { z } from "zod";

// Every API env var from docs/15-env-setup.md. The API refuses to boot when any of them is
// missing or invalid (docs/12, A05). Error messages name the variable, never its value.

const flag = z
  .enum(["0", "1"])
  .default("0")
  .transform((value) => value === "1");

const postgresUrl = z
  .string()
  .regex(/^postgres(ql)?:\/\//, "must be a postgres:// or postgresql:// URL");

function decodesToBytes(expected: number) {
  return (value: string) => {
    try {
      return Buffer.from(value, "base64").length === expected;
    } catch {
      return false;
    }
  };
}

function isEd25519PemBase64(value: string): boolean {
  try {
    const pem = Buffer.from(value, "base64").toString("utf8");
    return createPrivateKey(pem).asymmetricKeyType === "ed25519";
  } catch {
    return false;
  }
}

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_ENV: z.enum(["development", "staging", "production"]),
    PORT: z.coerce.number().int().positive().default(4000),
    WEB_ORIGIN: z.url(),
    DATABASE_URL: postgresUrl,
    DIRECT_URL: postgresUrl,
    REDIS_URL: z.string().regex(/^rediss?:\/\//, "must be a redis:// or rediss:// URL"),
    JWT_SECRET: z.string().min(32, "must be at least 32 characters"),
    OTP_PEPPER: z.string().min(16, "must be at least 16 characters"),
    OTP_DEV_ECHO: flag,
    /** D-043: OAuth web client id for Sign in with Google. Unset turns the button off (the API answers 403). */
    GOOGLE_CLIENT_ID: z.string().endsWith(".apps.googleusercontent.com").optional(),
    QR_SIGNING_PRIVATE_KEY: z
      .string()
      .refine(isEd25519PemBase64, "must be a base64 encoded Ed25519 private key PEM (docs/15)"),
    QR_SIGNING_KEY_ID: z.string().min(1).max(16),
    QR_SECRET_KEY: z.string().refine(decodesToBytes(32), "must be 32 random bytes in base64"),
    RAZORPAY_KEY_ID: z
      .string()
      .startsWith("rzp_test_", "only Razorpay test keys are allowed in this project (docs/12)"),
    RAZORPAY_KEY_SECRET: z.string().min(8),
    RAZORPAY_WEBHOOK_SECRET: z.string().min(8),
    RESEND_API_KEY: z.string().min(1),
    EMAIL_FROM: z.string().min(3),
    PAYMENTS_FAKE: flag,
    WORKER: flag,
    BULLMQ_DRAIN_DELAY_SEC: z.coerce.number().int().min(5).default(60),
    TZ_DISPLAY: z.literal(PLATFORM_TIME_ZONE).default(PLATFORM_TIME_ZONE),
  })
  .superRefine((env, ctx) => {
    if (env.APP_ENV === "production" && env.OTP_DEV_ECHO) {
      ctx.addIssue({ code: "custom", path: ["OTP_DEV_ECHO"], message: "must be 0 in production" });
    }
    if (env.APP_ENV === "production" && env.PAYMENTS_FAKE) {
      ctx.addIssue({ code: "custom", path: ["PAYMENTS_FAKE"], message: "must be 0 in production" });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

/** Used by ConfigModule. Throws one readable error listing every bad variable. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`);
    throw new Error(
      `Invalid environment. Fix apps/api/.env (see apps/api/.env.example):\n${lines.join("\n")}`,
    );
  }
  return result.data;
}
