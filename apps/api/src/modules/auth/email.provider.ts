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
      throw new AppError("INTERNAL", "Email delivery failed");
    }

    if (!response.ok) {
      // Status only: the Resend error body can echo the recipient.
      this.logger.error(`Resend email delivery failed with status ${response.status}`);
      throw new AppError("INTERNAL", "Email delivery failed");
    }
  }
}
