import { maskEmail } from "@aptransit/shared";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppError } from "../../common/errors/app-error";
import type { Env } from "../../config/env";

export interface EmailProvider {
  /** `body` is the plain text version; `html` (optional) the accessible HTML one. */
  sendEmail(to: string, subject: string, body: string, html?: string): Promise<void>;
}

export const EMAIL_PROVIDER = "EMAIL_PROVIDER";

/** 503 EMAIL_DELIVERY_FAILED: the client shows a clear "try again" message instead of a 500. */
export function deliveryFailed(): AppError {
  return new AppError("EMAIL_DELIVERY_FAILED", "The email could not be sent. Try again in a few minutes.");
}

@Injectable()
export class ResendEmailProvider implements EmailProvider {
  private readonly logger = new Logger(ResendEmailProvider.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async sendEmail(to: string, subject: string, body: string, html?: string): Promise<void> {
    const appEnv = this.config.get("APP_ENV", { infer: true });
    const nodeEnv = this.config.get("NODE_ENV", { infer: true });

    // Local development and tests: never call Resend, print the mail (with its code) instead.
    if (appEnv === "development" || nodeEnv === "test") {
      this.logger.log(`[Dev email] to ${maskEmail(to)} | ${subject} | ${body}`);
      return;
    }

    // Demo accounts (.test) cannot receive mail. Outside development the body holds a live
    // code, so it never reaches the logs (docs/12, A09). Use OTP_DEV_ECHO on staging instead.
    if (to.toLowerCase().endsWith(".test")) {
      this.logger.log(`Email to a .test address skipped: ${maskEmail(to)}`);
      return;
    }

    let response: globalThis.Response;
    try {
      response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        // A hung provider must not hold the login request open: fail fast and let the user retry.
        signal: AbortSignal.timeout(8_000),
        headers: {
          Authorization: `Bearer ${this.config.get("RESEND_API_KEY", { infer: true })}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.config.get("EMAIL_FROM", { infer: true }),
          to: [to],
          subject,
          text: body,
          ...(html ? { html } : {}),
        }),
      });
    } catch (err) {
      this.logger.error({ err }, "Resend request failed");
      throw deliveryFailed();
    }

    if (!response.ok) {
      // Status only: the Resend error body can echo the recipient. A 403 usually means the sender
      // domain is not verified (the onboarding@resend.dev test sender only reaches the account owner).
      this.logger.error(`Resend email delivery failed with status ${response.status}`);
      throw deliveryFailed();
    }
  }
}
