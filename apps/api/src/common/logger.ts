import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ConfigService } from "@nestjs/config";
import type { Params } from "nestjs-pino";
import type { Env } from "../config/env";

/** Secrets and personal data that must never reach the logs (docs/12, A09). */
export const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'res.headers["set-cookie"]',
  "*.otp",
  "*.code",
  "*.devCode",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.signature",
  "*.razorpaySignature",
  "*.password",
  "*.secret",
  "*.email",
  "*.phone",
  "req.query.email",
  "req.query.phone",
];

/** Query keys whose values are personal data: masked in the logged URL (GET /feedback/status). */
const SENSITIVE_QUERY = /([?&](?:email|phone|target)=)[^&#]*/gi;

/** The URL with personal query values replaced, for the request log (docs/12, A09). */
export function maskUrl(url: string | undefined): string | undefined {
  return url?.replace(SENSITIVE_QUERY, "$1[redacted]");
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** Reuses a safe incoming x-request-id, otherwise creates req_<uuid>, and echoes it back. */
export function requestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers["x-request-id"];
  const id =
    typeof incoming === "string" && REQUEST_ID_PATTERN.test(incoming) ? incoming : `req_${randomUUID()}`;
  res.setHeader("x-request-id", id);
  return id;
}

export function loggerParams(config: ConfigService<Env, true>): Params {
  const appEnv = config.get("APP_ENV", { infer: true });
  return {
    pinoHttp: {
      level: appEnv === "production" ? "info" : "debug",
      genReqId: requestId,
      redact: { paths: REDACT_PATHS, censor: "[redacted]" },
      customProps: () => ({ app: "api", env: appEnv }),
      serializers: {
        req: (req: { url?: string }) => ({ ...req, url: maskUrl(req.url) }),
      },
      autoLogging: {
        // Uptime monitors hit /health every few minutes. Keep the logs readable.
        ignore: (req) => req.url === "/api/v1/health",
      },
    },
  };
}
