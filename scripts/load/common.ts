/* eslint-disable no-console */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type autocannon from "autocannon";

// Shared helpers for the Day 17 load tests (docs/14 Performance targets).
// API_URL points at the API origin (default http://localhost:4000). Logins use OTP_DEV_ECHO=1.

/** Repo root: pnpm runs these scripts from apps/api but sets INIT_CWD to where you ran pnpm. */
export const ROOT = process.env.INIT_CWD ?? process.cwd();

export const API = (process.env.API_URL ?? "http://localhost:4000").replace(/\/$/, "") + "/api/v1";

/** Email OTP login for a seeded account; needs OTP_DEV_ECHO=1 on the target API. */
export async function login(email: string): Promise<string> {
  const post = (path: string, body: unknown) =>
    fetch(`${API}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const requested = (await (await post("/auth/otp/request", { channel: "EMAIL", target: email })).json()) as Record<string, unknown>;
  const code = Object.values(requested).find((v) => typeof v === "string" && /^\d{6}$/.test(v));
  if (!code) throw new Error("No OTP in the response. Is OTP_DEV_ECHO=1 on the API?");
  const verified = (await (await post("/auth/otp/verify", { channel: "EMAIL", target: email, code })).json()) as { accessToken?: string };
  if (!verified.accessToken) throw new Error(`Login failed for ${email}`);
  return verified.accessToken;
}

/** Prints p50, p95, p99, errors and non 2xx against the target, and saves the result under .local/load. */
export function report(name: string, result: autocannon.Result, targetP95Ms: number, rate: number): boolean {
  const l = result.latency as unknown as Record<string, number>;
  const p95 = l.p95 ?? l.p97_5;
  const pass = p95 < targetP95Ms && result.errors === 0 && result.non2xx === 0;
  const summary = {
    name,
    when: new Date().toISOString(),
    api: API,
    rateRps: rate,
    durationSec: result.duration,
    requests: result.requests.total,
    p50Ms: l.p50,
    p95Ms: p95,
    p99Ms: l.p99,
    maxMs: l.max,
    errors: result.errors,
    timeouts: result.timeouts,
    non2xx: result.non2xx,
    statusCodes: JSON.stringify((result as unknown as { statusCodeStats?: Record<string, { count: number }> }).statusCodeStats ?? {}),
    targetP95Ms,
    pass,
  };
  console.table(summary);
  const dir = resolve(ROOT, ".local/load");
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, `${name}-${Date.now()}.json`), JSON.stringify(summary, null, 2));
  return pass;
}
