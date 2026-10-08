/* eslint-disable no-console */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { qrStep, rotatingCode } from "@aptransit/shared";
import autocannon from "autocannon";
import { API, report, ROOT } from "./common";

// docs/14: validate p95 under 300 ms at 30 rps for 60 s. Run `pnpm load:pool` first: it puts
// load test conductors on running trips with ACTIVE tickets (one conductor is limited to 120 a minute). Each request sends a ticket number with
// its live code (manual entry, D-027), so every scan goes through signature, code and rule checks.
// The first scan of a ticket is VALID, later ones ALREADY_SCANNED (both are 200 responses).
//   pnpm load:validate          (API_URL, RATE, DURATION optional)

const rate = Number(process.env.RATE ?? 30);
const duration = Number(process.env.DURATION ?? 60);
const hmac = (k: Uint8Array, m: Uint8Array) => new Uint8Array(createHmac("sha256", k).update(m).digest());

async function main(): Promise<void> {
  const pool = JSON.parse(readFileSync(resolve(ROOT, ".local/load-pool.json"), "utf8")) as {
    conductors: Array<{ token: string; tripId: string; tickets: Array<{ ticketNumber: string; rotSecret: string }> }>;
  };
  // One request queue per conductor, round robin across them (each conductor stays under its limit)
  const scans = pool.conductors.flatMap((c) => c.tickets.map((t) => ({ ...t, tripId: c.tripId, token: c.token })));
  // Codes change every 30 s: precompute the current and next step for every ticket, refresh each step
  const codes = new Map<string, string>();
  const refresh = async () => {
    const step = qrStep(Date.now());
    for (const t of scans) codes.set(t.ticketNumber, await rotatingCode(hmac, Buffer.from(t.rotSecret, "base64url"), step));
  };
  await refresh();
  const timer = setInterval(() => void refresh(), 5_000);

  let i = 0;
  const result = await autocannon({
    url: API,
    duration,
    overallRate: rate,
    connections: 10,
    headers: { "content-type": "application/json" },
    requests: [
      {
        method: "POST",
        path: "/api/v1/tickets/validate",
        setupRequest: (req) => {
          // Interleave conductors: ticket k of conductor 1, then of conductor 2, and so on
          const n = pool.conductors.length;
          const k = i++;
          const c = pool.conductors[k % n]!;
          const t = { ...c.tickets[Math.floor(k / n) % c.tickets.length]!, tripId: c.tripId, token: c.token };
          return {
            ...req,
            headers: { ...req.headers, authorization: `Bearer ${t.token}` },
            body: JSON.stringify({
              ticketNumber: t.ticketNumber,
              liveCode: codes.get(t.ticketNumber),
              tripId: t.tripId,
              deviceTime: new Date().toISOString(),
            }),
          };
        },
      },
    ],
  });
  clearInterval(timer);
  process.exitCode = report("validate", result, 300, rate) ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
