# Handoff: current state of the repo

**Every AI session and every human starts here.** This is the living "where are we" file. The locked docs in `docs/` say what we are building. This file says what exists today, how it works, and what trips people up.

**Rule:** at the end of every day, the dev who merges last updates the "Current state" section below (it is part of the end of day report). If this file is stale, fix it before starting new work.

Read order for a new session:

1. `AGENTS.md` (hard rules)
2. This file
3. Today's `prompts/day-NN.md`
4. The docs that prompt lists under "Read first"
5. The README of every package you will touch (`apps/api`, `apps/web`, `packages/shared`, `packages/ui`)

---

## Current state (Day 15 implemented, 2026-10-06)

### Git

| Branch | Contains | Status |
| --- | --- | --- |
| `main` | Day 1 to Day 11, PR #4 merged | Baseline |
| `pranay-day12` | Day 12 to Day 15 code and progress updates | Fully verified, zero lint/type errors, 100% tests passing |

**Day 15 completed: operations detail screens (/ops/buses/[id], /ops/trips/[id], /ops/trips/[id]/replace, /ops/staff), complete admin UI (/admin stops, routes, timetables, users, policies, audit), 14-day history seed, daily rollups worker, government & analytics APIs, streaming UTF-8 BOM CSV reports, and E2E-9 spec.**

### Works today (verified 2026-10-06)

- Day 14: live operations dashboard, fleet/trips/incidents lists and actions, URL depot/date/status/route/search filters, shared DataTable and KpiTile, and guarded admin network/users/policies/settings/audit endpoints. All admin writes include atomic before/after audit snapshots. Scoped audit reads use entity snapshots rather than multi-depot actor roles.
- Day 14 root lint, typecheck, build and dashes passed. Full suite: shared 119, UI 46, web 42, API 359, scripts 6 passed; 6 database cases skipped. Local search and refund verification confirmed validFrom behavior, including a future refund policy retaining today's effective quote. See daily-log.md and D-029. Review/CI/merge remain pending.
- Refund policy isActive denotes the latest configured row; effective reads select the latest validFrom at or before now from retained history. Fare selection uses scheduled departure time. Admin settings changes invalidate the network cache. Zod 4 refined objects require safeExtend; derive partial patch schemas from their shape and revalidate the merged object on the server.

- Day 13: conductor home/scanner/manifest and live counts; approved manual ticket number plus live-code validation through unchanged QR rules; scoped operations dashboard/fleet/trips/staff/devices/incidents, atomic replacement and full operator cancellation refunds. Signed callbacks complete paid ticket refunds idempotently. Listener-only operations KPI updates run every 15 seconds.
- E2E-8 passed on desktop and Pixel 7, including axe and English/Telugu layouts at 360, 768 and 1280 px. Focused API tests: 18 validation and 13 operations passed; root lint, types, build, i18n, dashes and scripts passed. The simulator breakdown at 60 km, manager acknowledgement and replacement, preserved seat and citizen notification passed against local PGlite and Redis. Physical-phone HTTPS timing and other-dev/CI review remain pending.
- qr-scanner is allowed by docs/04. Test injection uses apt:test-scan only when NEXT_PUBLIC_PAYMENTS_FAKE=1 is set during the web build, and still invokes the validation API. The browser test mocks response cases; API HTTP tests enforce actual server rules.
- New Telugu copy must be written as UTF-8. Windows PowerShell's default pipe encoding can replace Telugu with question marks. Use apply_patch or Unicode escapes when passing scripts through this shell.
- Provider refund failures are preserved as FAILED rows for reconciliation; automatic retry is not part of Day 13. Review D-028 shared contracts before merge.


- Day 12: citizen tracking map and progress, shared authenticated sockets and REST fallback, driver live hook, notification/ticket query updates, stop/delay/pace math, durable trip notification deduplication, simulator stalls/breakdown, conductor assignment/manifest and ordered validation with audit and race protection. Local database validation p95 134.72 ms over 30 requests. Progress math has 100 percent line coverage. E2E-7 passed on desktop and mobile. See daily-log.md for measurements and checks.

- `pnpm lint`, `pnpm i18n:check`, `pnpm typecheck`, `pnpm test` (shared 119, ui 41, web 42, api 313 plus 6 database tests skipped, scripts 6), `pnpm build`, `pnpm check:dashes` pass on Windows (Node 24.13.1, pnpm 11.10).
- Day 8: gifting (`POST /tickets/:id/transfer`), passes with payments (`{ passId }`), Stree Shakti eligibility (mock provider, strict schema, no identifiers stored), zero fare free travel tickets; `/tickets/[id]` with the live rotating QR (Web Crypto), offline copy in IndexedDB, `/tickets/[id]/cancel`.
- Day 9: notifications (rows, email jobs rendered in the user's language, subscribers, endpoints), expiry jobs every 5 min, worker heartbeat in `/health`; `/tickets/[id]/gift`, `/passes`, `/passes/buy`, `/free-travel`, `/book/[tripId]/free`, bell and `/updates`, `Countdown`.
- Day 10: manifest, icons, `public/sw.js`, `/offline`, Install app; Playwright fixtures, E2E-1 to E2E-6 and axe checks: 18 of 18 pass locally on both projects with one worker.
- Day 11: driver endpoints, trusted `/tracking/ping`, live state in Redis, Socket.IO `/live`, incidents, `pnpm simulate`, `pnpm watch:live`; driver app `/driver`, `/driver/setup`, `/driver/trip/[id]`, `/driver/report` with the GPS sender and wake lock. Simulator to socket verified live; driver smoke spec passes.
- Everything above was checked on a local PGlite database with `scripts/dev-redis.mjs`, not on Neon or Upstash yet.

### Run the whole stack locally (no cloud accounts)

1. `npx -y @electric-sql/pglite-socket --db=.local/pgdata --port=5433 --max-connections=10` and `pnpm dev:redis` (port 6380, set `REDIS_LISTEN=127.0.0.1:6380`).
2. `apps/api/.env` from `.env.example` with `DATABASE_URL` and `DIRECT_URL` `postgresql://postgres:postgres@127.0.0.1:5433/postgres?sslmode=disable`, `REDIS_URL=redis://127.0.0.1:6380`, `APP_ENV=development`, `OTP_DEV_ECHO=1`, `PAYMENTS_FAKE=1`, fresh QR keys (docs/15). `apps/web/.env.local` with `NEXT_PUBLIC_PAYMENTS_FAKE=1`.
3. `pnpm --filter api exec prisma migrate deploy`, `pnpm db:seed`, then `pnpm --filter api build && node apps/api/dist/main.js` and `pnpm --filter web build && pnpm --filter web start`.
4. `E2E_PAYMENTS_FAKE=1 pnpm --filter web exec playwright test --workers=1`.
5. The worker (BullMQ) needs a real Redis: dev-redis cannot run it.

### Not done yet

| Item | Why | When |
| --- | --- | --- |
| Staging (Render api and worker, Vercel, Neon main, Razorpay webhook), smoke test, Lighthouse PWA, `v0.1.0` tag | Needs the cloud accounts (docs/15, docs/17) | Before the Day 12 demo |
| `TEST_DATABASE_URL`, `TEST_REDIS_URL` in CI | Needs the Neon test branch and Upstash | CI e2e job skips until then |
| Worker run for an hour, Upstash command count | Needs a real Redis | After the real `.env` |
| Real Razorpay test checkout | Placeholder keys locally | When test keys exist |
| Device approval screen for the depot | Scheduled | Day 14 (ops) |
| Implied speed check between GPS points | The simulator compresses time (D-025) | Day 17 hardening |
| Short Telugu label for "Track bus" | D-015, needs a native speaker | Open |

### Decisions

All in `progress/decisions-log.md`. D-022 (Day 8), D-023 (Day 9), D-024 (Day 10) D-025 (Day 11) and D-026 (Day 12) are proposed.

### New gotchas (Days 8 to 12)

- E2E-7 fixture and API must use the same DATABASE_URL. Set it explicitly for local tests so a saved .env cannot send fixture writes to another development database.
- Repeated E2E retries can exhaust seeded driver OTP limits. Use a fresh isolated test Redis or clear only local test counters.
- Simulator delay minutes are wall-clock minutes, even with accelerated movement.
- Map paint widths must be pixel tokens, not a numeric parse of rem spacing.
- Regenerate Prisma after enabling relationJoins; no database migration is required for this generator feature.


| Symptom | Cause | Fix |
| --- | --- | --- |
| "Maximum update depth exceeded" (React error 185) on a page using a browser store | `useSyncExternalStore` got a new subscribe function each render | Keep subscribe and getSnapshot stable (module level), see `lib/use-browser-state.ts` |
| Local API hangs after a request with Telugu text | Old `dev-redis.mjs` counted characters, not bytes | Fixed; restart `pnpm dev:redis` and the API (the API does not reconnect to a restarted dev-redis by itself) |
| E2E login fails with RATE_LIMITED | 10 OTP requests per IP per hour (docs/12) | Use the `citizen` and `citizen2` fixtures in `e2e/fixtures.ts`; locally, restarting dev-redis clears the counter |
| A test's ticket cannot be gifted or cancelled | E2E-3 moved that trip to depart in 30 min | Book with `pickTrip` / `bookAndPay` (3 h or more ahead) |
| `/driver/today` gives BAD_RESPONSE in the web | API dist older than the shared schema | Rebuild shared, then the API, after any contract change |
| A new socket is refused a depot room it should get | Token checked after the client already subscribed | Authentication runs in Socket.IO middleware (`afterInit`), keep it there |
| Manifest 500 in production | `import.meta.url` is undefined in the server bundle | Read files relative to `process.cwd()` (apps/web), see `lib/token-values.ts` |
| Simulator pings refused 429 | One driver and one device drive every trip | `--all` shares 25 pings a minute; one trip at `--speed 60` takes under 2 min for a short route |

---

## Repo map (as built)

```
AGENTS.md                      rules for every tool and human (hard rules, commits, commands)
CLAUDE.md                      imports AGENTS.md
package.json                   root scripts, pnpm 11 pinned in packageManager
pnpm-workspace.yaml            workspaces, allowBuilds, overrides, shellEmulator (read the comments)
turbo.json                     task graph: generate, build, dev, lint, typecheck, test
.github/workflows/ci.yml       install, dashes, lint, typecheck, test, build, audit
scripts/check-dashes.mjs       fails on em or en dash in any tracked or new file

packages/config                tsconfig.base.json, eslint.base.mjs (base, sharedIgnores, sharedRules, nestParserOptions), prettier
packages/shared                zod contracts used by web and api. Compiled to CommonJS in dist/
  src/enums.ts                 every enum from docs/05
  src/errors.ts                ErrorCode, ERROR_HTTP_STATUS, ErrorResponse
  src/status.ts                STATUS_MAP, deriveTripDisplayStatus, busDisplayStatus, TICKET_STATUS_MAP, colourOfDay
  src/money.ts                 paise helpers, Paise schema
  src/fare.ts                  calculateFare, refundQuote (the only fare math)
  src/schemas/                 health, auth, seat-layout, search (SearchTripsQuery, TripSummaryDto), network (places, districts, routes, timetable)
packages/ui                    design tokens and (from Day 2) components. Source only, compiled by Next
  src/tokens.css               ALL raw colour values live here and nowhere else
  src/cn.ts                    class joiner that knows our token names

apps/api                       NestJS 11
  src/main.ts                  HTTP entry
  src/worker.ts                worker entry (WORKER=1), no queues yet
  src/http-app.ts              configureHttpApp(): prefix, helmet, CORS, body limit, logger. Used by main and tests
  src/app.module.ts            ConfigModule (zod), LoggerModule (pino), Prisma, Redis, Health, global error filter
  src/config/env.ts            EnvSchema and validateEnv (every env var)
  src/common/                  AppError, AllExceptionsFilter, @Public(), logger params (redaction, request ids)
  src/prisma/                  PrismaService (Prisma 7 + pg adapter, lazy connect), global module
  src/redis/                   RedisService (ioredis, lazy, TLS ready), global module
  src/modules/health/          the reference module: controller, service, tests
  src/modules/network/         Day 4 public network and search: repository (queries), service (rules), trip-summary.ts
  src/generated/prisma/        generated Prisma client (git ignored, created by `pnpm --filter api generate`)
  prisma/schema.prisma         full schema v1 from docs/05 (seed in prisma/seed.ts)
  prisma/migrations/           20260923000000_init
  test/                        setup-env.ts, test-env.ts, http.test.ts (pipeline), health.int.test.ts (Neon)

apps/web                       Next.js 16 App Router
  app/layout.tsx               fonts (Inter, Noto Sans Telugu), metadata title template
  app/globals.css              Tailwind + tokens + @source for packages/ui
  app/(citizen)/               citizen shell, home (home-search.tsx), account
  app/(auth)/login/            login (email or phone OTP)
  proxy.ts                     route guard on the apt_session marker (D-016)
  lib/                         api.ts (fetch wrapper, refresh), session.ts (token store), roles.ts, recent-places.ts, query-keys.ts
  components/                  providers, auth-provider (useAuth, useMe), require-auth (RequireAuth, RequirePermission), place-combobox
  app/{driver,conductor,ops,gov,admin}/  staff shells (components/field-shell.tsx, management-shell.tsx)
  i18n/request.ts              locale from cookie, then Accept-Language; merges web and shared messages
  next.config.ts               /api/v1 rewrite to API_URL, agentRules off, transpilePackages ui
```

---

## How things work

### Build graph (Turborepo)

- `packages/shared` must be **built** before anything imports it (`dist/`). Turbo does it for you: `build`, `dev`, `lint`, `typecheck` and `test` all depend on `^build`.
- `apps/api` runs `generate` (Prisma client) before `build`, `dev`, `lint`, `typecheck` and `test`.
- Changed something in `packages/shared` while `pnpm dev` runs? The shared `dev` task (`tsc --watch`) rebuilds `dist/`. Next picks it up by itself. The API does not (Nest only watches `apps/api/src`): save any file in `apps/api/src` or restart `pnpm dev`. If types look stale in your editor, run `pnpm --filter @aptransit/shared build`.
- `packages/ui` is **not** built. Next compiles it from source (`transpilePackages`).

### API request pipeline

1. `pino-http` gives every request an id: incoming `x-request-id` if it looks safe, else `req_<uuid>`. Sent back in the `x-request-id` header.
2. helmet headers, CORS only for `WEB_ORIGIN` (with credentials), JSON body limit 100 kb, `trust proxy` 1.
3. Global prefix `api/v1`.
4. Controllers. Anything thrown ends in `AllExceptionsFilter`, which always answers the docs/06 shape `{ error: { code, message, details?, requestId } }`. `AppError(code, message, details)` sets the code and the HTTP status from `ERROR_HTTP_STATUS`. 5xx never leak the real message.

### Config

- `src/config/env.ts` is the single list of env vars. `ConfigModule` validates at **import time** of `AppModule`. Missing or bad values stop the boot with a list of variable names (never values).
- Read values with `ConfigService<Env, true>`: `config.get("PORT", { infer: true })`.
- `APP_ENV` (development, staging, production) gates dev only features. `NODE_ENV=test` makes Nest ignore `.env` files in tests.

### Database and Redis

- Prisma 7 with the new `prisma-client` generator, output `src/generated/prisma`, CommonJS. Import with `import { PrismaClient, Prisma } from "../generated/prisma/client"` (relative path from your file).
- `PrismaService` extends the client and uses `@prisma/adapter-pg` with the **pooled** `DATABASE_URL`. The CLI uses the **direct** `DIRECT_URL` from `prisma.config.ts`, which loads `.env` with `process.loadEnvFile`.
- Both Prisma and Redis connect lazily, so the API boots even when they are down. Health tells the truth.
- Redis errors are logged at most once per 30 s (Upstash retries forever otherwise).

### Web styling

- `app/globals.css` imports Tailwind, then `@aptransit/ui/tokens.css`. The tokens file **removes** Tailwind's default palette, font sizes, radii, shadows and easings. Only our tokens exist. See `packages/ui/README.md` for the class list.
- Theme: tokens switch on `data-theme="dark"` on `<html>`, or on the OS preference when there is no `data-theme="light"`. The cookie based theme arrives on Day 3.
- Telugu: any element with `lang="te"` (or inside one) gets 15 percent taller line heights automatically.

---

## Patterns to copy

### Add an API endpoint (the health module is the template)

1. Request and response zod schemas in `packages/shared/src/schemas/<area>.ts`, exported from `src/index.ts`. Names: `<Thing>Input`, `<Thing>Dto`, `<Thing>Query`.
2. `apps/api/src/modules/<area>/` with `<area>.module.ts`, `<area>.controller.ts`, `<area>.service.ts`, `<area>.service.test.ts`. Register the module in `app.module.ts`.
3. Business failures: `throw new AppError("SEAT_TAKEN", "Seat 18 is no longer available", { seatNo: "18" })`. Only codes from `packages/shared/src/errors.ts`. Need a new code? Add it there with its HTTP status and add the message to both i18n files (Day 3 onwards).
4. Public routes get `@Public()`. Everything else needs login (global `JwtAuthGuard`). Permissions with `@Can`, limits with `@Throttle`, audit with `@Audit` (see `apps/api/README.md`).
5. Inject classes with **value imports** (`import { PrismaService } from ...`), not `import type`, or Nest DI breaks. ESLint already knows this (`nestParserOptions`).
6. Tests: unit tests next to the file; HTTP tests in `apps/api/test/` using `configureHttpApp` like `http.test.ts`, overriding `PrismaService` and `RedisService` when you do not need real ones.
7. Update `docs/06` only through a decision if the built shape differs.

### Add an env var

1. `apps/api/src/config/env.ts` (with a clear error message).
2. `apps/api/.env.example` with a fake value.
3. `apps/api/test/test-env.ts` with a fake value, or every API test fails at import.
4. docs/15 through a decision entry. Tell the other dev to update their `.env`.

### Change the database

1. Edit `apps/api/prisma/schema.prisma` (docs/05 is the source of truth).
2. `pnpm db:migrate` (runs `prisma migrate dev` against your own Neon branch) and name the migration.
3. Without a database you can still preview the SQL by diffing the committed schema against yours (run in `apps/api`):
   `git show HEAD:apps/api/prisma/schema.prisma > old.prisma` then `pnpm exec prisma migrate diff --from-schema old.prisma --to-schema prisma/schema.prisma --script`, then delete `old.prisma`. (`--from-migrations` needs a shadow database, so it does not work offline.)
4. Commit the migration folder. Never edit an applied migration.

### Add a UI token or utility

1. Raw value in `packages/ui/src/tokens.css` (light and both dark blocks when it changes by theme).
2. Map it in `@theme inline` (colours) or `@theme` (sizes), or add an `@utility`.
3. If it creates a new class family that could clash (a new font size, z layer, spacing name), register it in `packages/ui/src/cn.ts`, otherwise `cn()` may drop classes silently.
4. Document it in `packages/ui/README.md`.

### React state from the browser

The Next lint config includes the React Compiler rules. `setState` directly inside `useEffect` is an error. Read browser state (theme, media queries, time) with `useSyncExternalStore`, and change things in event handlers. See `apps/web/app/_token-check/token-check.tsx`.

---

## Gotchas (Day 1 to Day 3)

| Symptom | Cause | Fix |
| --- | --- | --- |
| `ERR_PNPM_IGNORED_BUILDS` on install | pnpm 11 blocks install scripts | Add the package to `allowBuilds` in `pnpm-workspace.yaml` (true only if it really needs its script) and log it |
| pnpm adds lines to `minimumReleaseAgeExclude` | pnpm 11 protects against very new releases | Keep them, they are pinned versions we chose |
| `WORKER=1 nest start` fails on Windows | cmd.exe | Already solved: `shellEmulator: true` |
| `pnpm --filter api prisma ...` says no script | pnpm runs scripts, not binaries | `pnpm --filter api exec prisma ...` or the `db:*` scripts |
| All API tests fail with "Invalid environment" | Config validates at import time | Add the new var to `test/test-env.ts` |
| Nest cannot resolve a dependency | Injected class imported with `import type` | Use a value import |
| `cn("text-h1 text-muted")` loses a class | tailwind-merge did not know a token name | Register it in `packages/ui/src/cn.ts` |
| `bg-white`, `text-lg`, `bg-gray-100` do nothing | Defaults removed on purpose | Use tokens (`bg-surface-raised`, `text-body-lg`, `bg-surface`) |
| Horizontal scroll at 360 px in Telugu | Long compound words | Base layer wraps long words; in grids and flex rows add `min-w-0` to text cells |
| `next dev` creates AGENTS.md and CLAUDE.md in apps/web | Next 16 writes agent files | Already off: `agentRules: false` |
| Port 3000 or 4000 busy after stopping a server | Windows keeps the child process | `netstat -ano \| findstr :3000` then `taskkill /PID <pid> /F` |
| Prisma prints "Update available 8.x" | Prisma 8 is a release candidate | Ignore, we stay on 7 (D-003). `generate` already hides it |
| CRLF warnings on commit | Global `core.autocrlf` | Harmless: `.gitattributes` stores LF |
| Neon test skipped in `pnpm test` | No `TEST_DATABASE_URL` | Expected until the secret exists |
| A class like `text-text`, `rounded-control`, `border-border-default` does nothing, build still green | Tailwind silently skips names that are not in our theme | Use the names in `packages/ui/README.md` (`text-fg`, `rounded-md`, `border-default`). Check rendered styles in the browser |
| "Functions cannot be passed directly to Client Components" | A server layout passed `icon: Bus` to a client component | Pass `icon: <Bus />` |
| "Event handlers cannot be passed to Client Component props" | A `packages/ui` component with handlers lacks `"use client"` | Add the directive at the top of the component file |
| Page title "X · AP TransitOS · AP TransitOS" | Nested layout used `title.default` under the root template | Use `title.absolute` in nested layouts |
| React Compiler lint: "This value cannot be modified" on `document.cookie` | Writing a global inside a component | Use `lib/preferences.ts` |
| Web page 401 loops or never refreshes | Calling fetch directly | Always go through `api()` in `lib/api.ts`; pass `redirectOn401: false` for public data |
| `useSearchParams` breaks `pnpm build` (needs Suspense) | Client component on a static page | Read `window.location` in an effect, or take `searchParams` in the server page and pass it down |
| Form reads localStorage and hydration fails | Server and first client render differ | Render the form only after mount (`useSyncExternalStore` mounted flag, see `home-search.tsx`) |
| Local API waits about 4 s per request | No Redis running, commands time out, then fail open | Expected without Upstash. Everything still works |
| Want a real database without Neon | No Postgres on the machine | `npx` PGlite socket server in your scratch folder, point `DATABASE_URL` and `DIRECT_URL` at it, `prisma migrate deploy`, `pnpm db:seed`. Never commit it |
| API test gets 429 unexpectedly | Tests share one IP and the 10 per IP per hour OTP limit | Reset the IP counter in the fake Redis (see `resetIpLimit` in `test/auth.test.ts`) |
| BullMQ `add` fails with "Custom Id cannot contain :" | BullMQ job ids cannot hold a colon | Use a dash (`expiry-<bookingId>`, see `expiryJobId`). Never swallow queue errors silently in tests: the mock queue records `opts` |
| New Lua script works on Upstash but not locally | `scripts/dev-redis.mjs` fakes Lua by matching a marker comment | Start the script with `-- <name>` and add the same behaviour to `runEval` and to the test mock `eval` |
| Local booking takes 3 s | dev-redis cannot run BullMQ, the expiry job add times out | Expected locally. With Upstash the job is scheduled |
| Payment test needs a webhook body | `FakePaymentProvider.webhook(event, paymentId)` signs it like Razorpay | Send it as a raw JSON string with the `X-Razorpay-Signature` header; the app needs `rawBody: true` |
| New code makes tickets | Only `BookingConfirmationService.confirmBooking` may (docs/06) | Call it; never `ticket.create` elsewhere |
| Booking page loses typed names | The draft lives in `lib/booking-draft.ts` (session storage per trip) | Write every change there; read it through `useBookingDraft` (null until hydrated) |
| Dev only route missing locally | `ConfigModule.forRoot` loads `.env` asynchronously and writes validated flags back as "true" | Gate modules with `ConditionalModule.registerWhen` and accept "1" or "true" (see `paymentsFakeEnabled`) |
| Local E2E fails with a 500 from POST /bookings | PGlite with parallel connections can return a null relation | Run Playwright with `--workers=1` locally (CI already does) |
| Need a ticket inside its activation window | Seed trips leave later | `pnpm --filter api demo:window <ticket code> [minutes]` (dev only) |
| `/search` shows From and To instead of place names | The URL has stop ids only; names come from `lib/saved-search.ts` (session storage) | Opening a shared link shows the generic labels. A by id places endpoint would fix it (Dev B) |
| `PlaceCombobox` hydration error on an SSR page | Recent places came from localStorage on the first render | Fixed: read after mount. Do the same for any browser storage read |

---

## Commands

```bash
pnpm install                      # pnpm 11 required: npm i -g pnpm@11 (or corepack enable)
pnpm dev                          # web :3000 and api :4000
pnpm dev:worker                   # worker process (WORKER=1)
pnpm lint                         # eslint everywhere + check:dashes
pnpm typecheck
pnpm test                         # vitest in shared and api + script tests
pnpm build
pnpm check:dashes
pnpm db:migrate                   # prisma migrate dev on your Neon branch
pnpm --filter api generate        # regenerate the Prisma client
pnpm --filter api exec prisma studio
pnpm --filter @aptransit/shared build
pnpm audit --prod --audit-level high
```

---

## Day 2 notes

### Dev A (design system primitives)

- `packages/ui` has no test setup and no React dependencies yet. Add Vitest, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom` and `jsdom` as dev dependencies of `packages/ui` (decision D-010), a `vitest.config.mts` with `environment: "jsdom"`, and a `test` script so Turbo picks it up.
- Radix, `lucide-react`, `class-variance-authority`, `sonner`, `vaul` are allowed by docs/04. Add them to `packages/ui` (not `apps/web`).
- shadcn CLI expects a single app. Easiest: copy each component's source from the shadcn site into `packages/ui/src/components/` and restyle it with our tokens. Never keep shadcn's colour variables (`bg-background`, `text-foreground` and friends do not exist here).
- Components must export from `packages/ui/src/index.ts`. Show them on the Day 1 token page for now (it becomes `/design` on Day 3).
- Anything with state in the browser: follow the `useSyncExternalStore` pattern above.

### Dev B (schema and seed)

- `schema.prisma` has only `Setting`. Add everything from docs/05 in one migration named `schema_v1`, on top of `20260923000000_init`.
- Replace the `db:seed` and `db:reset` placeholders in `apps/api/package.json`. Use `tsx` (allowed by docs/04) and add the seed command to `prisma.config.ts` (`migrations.seed`).
- `db:reset` must refuse to run when `DATABASE_URL` points at the Neon `main` branch.
- New shared files (codes, polyline, time, permissions) go in `packages/shared/src/` with tests and exports in `index.ts`.
- `packages/shared` must stay free of Node only APIs (the web imports it too). Use `Intl` for time zones, not a date library.

---

## Day 3 notes (done, kept for history)

- Dev A: shells, next-intl with cookie locale, `/design`, 404 and error pages.
- Dev B: OTP auth, refresh rotation, guards, rate limits, audit.
- The review on 2026-09-27 fixed the bugs listed in `progress/daily-log.md` ("Day 03 review").

## Day 4 notes (done, kept for history)

- Dev B: fare.ts, network and search endpoints, apt_session marker (D-016), seed aligned with docs/19 (D-018).
- Dev A: api client and session, proxy guard, home, login, account, OtpInput and DatePicker in packages/ui.

## Day 5 notes (built 2026-10-02)

### Git

Day 5 was completed on `main` directly (owner's request, same as Day 4).

### Dev A (search results, bus details, timetable)

All six items from the prompt are done:

1. `packages/shared/src/format.ts`: `formatTime`, `formatDate`, `formatMoney` (paise in, Indian grouping), `formatDuration`, `formatDistance`, all locale-aware (en/te, Asia/Kolkata). Unit tests added (96 shared tests pass).
2. `TripCard` in `packages/ui/src/components/trip-card.tsx`: departure (large, tabular), service type (i18n key), arrival with approx label, duration, seats-left (ICU plural, warning at 5 or fewer, "Full" + not clickable at 0), fare, StatusBadge when not UPCOMING, free-travel chip. Whole card is one accessible link.
3. `/search` (`apps/web/app/(citizen)/search/`): server page reads params, passes to `SearchClient`. Sticky summary bar (from/to/date, Edit opens Sheet). Time band chips (Morning 05:00-11:59, Afternoon 12:00-16:59, Evening 17:00-20:59, Night 21:00-04:59) stored in URL. Results with skeletons. Empty + Error states. Responsive: filters + search form in left column on md+.
4. `/bus/[tripId]` (`apps/web/app/(citizen)/bus/[tripId]/`): `GET /trips/:id` + `GET /trips/:id/fare`. Shows service type, bus reg, departure/arrival, fare breakdown, seats left, live status, boarding/dropping points, stops timeline. Book ticket (primary, disabled when full or closed), Track bus, View route actions. All 4 states.
5. `/timetable`: districts -> bus stands -> routes breadcrumb. `/timetable/route/[routeId]`: first/last/next bus, frequency, date switcher (Today/Tomorrow/calendar), trip list with StatusBadge, stops list. All from Day 4 endpoints.
6. Responsive on md+. `data-testid` attributes on key elements for E2E.

### Dev B (trip details, seats, holds)

All six items from the prompt are done:

1. Shared schemas in `packages/shared/src/schemas/trips.ts`: `TripDetailDto`, `SeatMapDto`, `FareDto`, `CreateBookingInput`, `BookingDto`, `RefundTierDto`.
2. `GET /trips/:id`, `GET /trips/:id/seats?from&to`, `GET /trips/:id/fare?from&to` (all public). `holdcount:{tripId}` counter key maintained on hold/release. `seatsLeft` in search result subtracts live holds.
3. `POST /bookings`: validates settings, stop order, seat existence and non-blocked state. Atomic Redis hold (SET NX EX) for all seats; rollback on any failure with SEAT_TAKEN. DB transaction for booking + passengers. Idempotency-Key support.
4. `GET /bookings/:id` (owner only), `DELETE /bookings/:id` (owner, PENDING_PAYMENT only: releases holds, CANCELLED).
5. BullMQ: `QueueModule` (producers in API), worker process (WORKER=1). Processors in `apps/api/src/modules/queue/processors/`: `expiry.processor.ts` (booking-hold-expired), `maintenance.processor.ts` (generate-trips daily 00:30 IST).
6. Tests in `apps/api/test/trips-bookings.test.ts`: concurrency (two parallel POST for same seat, exactly 1 succeeds), DELETE releases holds, validation failures. All 116 api tests pass (6 skipped without TEST_DATABASE_URL).

### E2E

- `apps/web/playwright.config.ts`: Desktop Chrome + Pixel 7 profiles.
- `apps/web/e2e/E2E-1-guest-search.spec.ts`: home to search (Kurnool to Vijayawada), results + filter chip URL persistence, open bus details, back keeps filters.
- Run with: `pnpm e2e` (needs dev server on :3000 and API on :4000 with a seeded database).

### Current state (Day 5 complete, 2026-10-02)

| Check | Result |
| --- | --- |
| `pnpm check:dashes` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS (shared 96, ui 28, web 33, api 116/6 skipped, scripts 6) |
| E2E-1 | Written, requires running servers + seeded DB |

### Not done yet

| Item | Why | When |
| --- | --- | --- |
| E2E-1 running in CI | Needs Neon test branch + Upstash + seeded data | CI setup |
| Seat selection UI | Not today per prompt | Day 6+ |
| Payment flow | Not today per prompt | Day 10 |
| Upstash usage logged | Needs running Upstash instance | After real .env |
| Worker drain delay verified | Needs BULLMQ_DRAIN_DELAY_SEC in .env | After real .env |

## Day 13 notes

The API validation and conductor manifest contracts are ready for the scanner UI. Use schemas/conductor.ts and earlierScanAt for duplicate scan copy. Keep QR validation on the server; mirror reason labels through both i18n files.
