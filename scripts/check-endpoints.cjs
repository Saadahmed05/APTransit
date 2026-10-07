// Day 19: every endpoint in docs/06 exists in the API, and every API route is in docs/06 (or listed
// below with its decision). Reads the docs/06 tables and the Nest controller decorators.
//   pnpm check:endpoints
const fs = require("fs");
const path = require("path");

/** Routes deliberately not built or not documented, each with its decision. */
const ALLOWED_MISSING = new Map([
  ["GET /conductor/trips/:p/offline-pack", "D-031: offline pack moved to the backlog"],
  ["POST /tickets/validate/batch", "D-031: offline pack moved to the backlog"],
]);
const ALLOWED_EXTRA = new Map([
  ["GET /ops/depots", "D-029: scoped lookups for the dashboard forms"],
  ["GET /ops/bus-types", "D-029"],
  ["GET /ops/routes", "D-029"],
  ["GET /driver/trips", "Day 11: today's trip list for the driver app (D-025)"],
]);

const norm = (method, p) => `${method} ${("/" + p).replace(/\/+/g, "/").replace(/\/$/, "").replace(/:[A-Za-z]+/g, ":p") || "/"}`;

// docs/06 rows: | GET | /path | ... ; "GET, POST" and "/a, /a/:id" and "/x/:id/approve and /revoke"
const doc = fs.readFileSync(path.join(__dirname, "../docs/06-api-contract.md"), "utf8");
const documented = new Set();
for (const line of doc.split("\n")) {
  const m = /^\|\s*((?:GET|POST|PATCH|PUT|DELETE)(?:,\s*(?:GET|POST|PATCH|PUT|DELETE))*)\s*\|\s*([^|]+)\|/.exec(line);
  if (!m) continue;
  const methods = m[1].split(",").map((s) => s.trim());
  const raw = m[2].replace(/`[^`]*`/g, "").trim();
  const paths = [];
  for (const part of raw.split(/,\s*/)) {
    const [first, ...rest] = part.split(/\s+and\s+/);
    const clean = (s) => s.trim().split(/\s+/)[0];
    const head = clean(first);
    if (!head.startsWith("/")) continue;
    paths.push(head);
    for (const r of rest) {
      const tail = clean(r);
      if (tail.startsWith("/")) paths.push(head.replace(/\/[^/]+$/, "") + tail);
    }
  }
  // A collection and its item in one row: POST goes to the collection, PATCH, PUT and DELETE to the item
  const item = (p) => /\/:[A-Za-z]+$/.test(p);
  const mixed = paths.some(item) && paths.some((p) => !item(p));
  for (const method of methods)
    for (const p of paths) {
      if (mixed && method === "POST" && item(p)) continue;
      if (mixed && ["PATCH", "PUT", "DELETE"].includes(method) && !item(p)) continue;
      documented.add(norm(method, p));
    }
}

// Nest controllers
const implemented = new Set();
const walk = (d) =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".controller.ts") ? [path.join(d, e.name)] : []));
for (const file of walk(path.join(__dirname, "../apps/api/src"))) {
  const src = fs.readFileSync(file, "utf8");
  for (const block of src.split(/@Controller\(/).slice(1)) {
    const prefix = /^\s*(?:"([^"]*)")?/.exec(block)[1] ?? "";
    for (const r of block.matchAll(/@(Get|Post|Patch|Put|Delete)\(\s*(?:"([^"]*)")?\s*\)/g)) {
      implemented.add(norm(r[1].toUpperCase(), `${prefix}/${(r[2] ?? "").replace(/\.csv$/, ".csv")}`));
    }
  }
}

const missing = [...documented].filter((r) => !implemented.has(r) && !ALLOWED_MISSING.has(r)).sort();
const extra = [...implemented].filter((r) => !documented.has(r) && !ALLOWED_EXTRA.has(r)).sort();
console.log(`docs/06 endpoints: ${documented.size}, API routes: ${implemented.size}`);
console.log(`In docs/06 but not in the API (${missing.length}):`);
missing.forEach((r) => console.log(`  ${r}`));
console.log(`In the API but not in docs/06 (${extra.length}):`);
extra.forEach((r) => console.log(`  ${r}`));
for (const [r, why] of [...ALLOWED_MISSING, ...ALLOWED_EXTRA]) console.log(`  allowed: ${r} (${why})`);
process.exitCode = missing.length || extra.length ? 1 : 0;
