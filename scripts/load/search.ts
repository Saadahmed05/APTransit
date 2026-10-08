/* eslint-disable no-console */
import autocannon from "autocannon";
import { API, report } from "./common";

// docs/14: search p95 under 250 ms at 50 rps for 60 s. Public endpoint, rotating real queries.
//   pnpm load:search            (API_URL, RATE, DURATION optional)
// Note: the API limits search to 60 per IP per minute (docs/12). Run against staging with the
// limit raised for the test, or from several IPs; 429s count as failures here on purpose.

const rate = Number(process.env.RATE ?? 50);
const duration = Number(process.env.DURATION ?? 60);

async function placeId(q: string): Promise<string> {
  const res = (await (await fetch(`${API}/places/search?q=${encodeURIComponent(q)}`)).json()) as Array<{ id: string }>;
  if (!res[0]) throw new Error(`No place for ${q}`);
  return res[0].id;
}

async function main(): Promise<void> {
  const pairs = await Promise.all(
    [
      ["Kurnool", "Vijayawada"],
      ["Kurnool", "Nandyal"],
      ["Vijayawada", "Guntur"],
      ["Kurnool", "Tirupati"],
      ["Dwaraka", "Simhachalam"],
    ].map(async ([a, b]) => [await placeId(a!), await placeId(b!)] as const),
  );
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  let i = 0;
  const result = await autocannon({
    url: API,
    duration,
    overallRate: rate,
    connections: 10,
    requests: [
      {
        method: "GET",
        setupRequest: (req) => {
          const [from, to] = pairs[i++ % pairs.length]!;
          return { ...req, path: `/api/v1/search/trips?from=${from}&to=${to}&date=${date}` };
        },
      },
    ],
  });
  process.exitCode = report("search", result, 250, rate) ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
