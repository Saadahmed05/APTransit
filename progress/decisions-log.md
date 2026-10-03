# Decisions log

The only way to change a locked doc in `docs/`. Add an entry, agree at the daily sync, then the doc owner updates the doc in a PR titled `Update docs: <topic>`.

## Template

```markdown
### D-NNN · <short title>
- **Date:** YYYY-MM-DD
- **Raised by:** Dev A or Dev B
- **Doc affected:** docs/NN-name.md (section)
- **Problem:** one or two lines
- **Decision:** one or two lines
- **Status:** Proposed, Agreed, Done
```

## Decisions

### D-000 · Kit baseline
- **Date:** Day 0
- **Raised by:** Both
- **Doc affected:** all
- **Problem:** need one locked reference before coding starts.
- **Decision:** docs 00 to 19, 99 and ADR 001 to 005 are the baseline. Stack, scope and rules as written.
- **Status:** Agreed

### D-001 · pnpm 11 instead of 10
- **Date:** 2026-09-23
- **Raised by:** Dev B
- **Doc affected:** docs/04-tech-stack.md (Runtime and tooling)
- **Problem:** docs said pnpm 10.x, but pnpm 11 is installed on the dev machine and is current.
- **Decision:** pin `pnpm@11.10.0` in the root `packageManager`. Install scripts are allowed only for prisma, @prisma/engines and @swc/core (`allowBuilds` in pnpm-workspace.yaml). pnpm 11 reads settings from pnpm-workspace.yaml, so `autoInstallPeers` lives there and there is no `.npmrc`.
- **Status:** Proposed, review at the Day 1 sync

### D-002 · Tooling packages missing from docs/04
- **Date:** 2026-09-23
- **Raised by:** Dev B
- **Doc affected:** docs/04-tech-stack.md
- **Problem:** the listed libraries need a few companions that docs/04 did not name.
- **Decision:** allowed as tooling or required peers: @nestjs/cli and @nestjs/testing (build, watch, tests), @swc/core (for unplugin-swc), @eslint/js and globals (ESLint flat config), reflect-metadata and rxjs (Nest peers), pino and pino-http (nestjs-pino peers), @types/* packages, eslint-config-next (Next.js lint rules including React hooks).
- **Status:** Proposed, review at the Day 1 sync

### D-003 · Stay on the documented majors
- **Date:** 2026-09-23
- **Raised by:** Dev B
- **Doc affected:** docs/04-tech-stack.md
- **Problem:** NestJS 12, TypeScript 7, ESLint 10, Vitest 5 and a Prisma 8 release candidate are out.
- **Decision:** keep NestJS 11, TypeScript 5.9, ESLint 9, Prisma 7 as documented. Vitest (not pinned in docs) is pinned to 4.1 for stability. Revisit after Day 20.
- **Status:** Proposed, review at the Day 1 sync

### D-004 · Prisma config without dotenv
- **Date:** 2026-09-23
- **Raised by:** Dev B
- **Doc affected:** docs/15-env-setup.md (Prisma with Neon)
- **Problem:** Prisma 7 does not load .env, and `env('DIRECT_URL')` fails in CI where no database secret exists.
- **Decision:** prisma.config.ts loads .env with the Node 22 built in `process.loadEnvFile` and reads `process.env.DIRECT_URL`, so `prisma generate` works without secrets. Generated client goes to `apps/api/src/generated/prisma` (git ignored, CommonJS).
- **Status:** Proposed, review at the Day 1 sync

### D-005 · packages/shared is compiled to CommonJS
- **Date:** 2026-09-23
- **Raised by:** Dev B
- **Doc affected:** docs/03-architecture.md (Monorepo layout)
- **Problem:** Nest runs as CommonJS, Next bundles anything. Shared TS source cannot be imported by Nest directly.
- **Decision:** `packages/shared` builds with tsc to `dist` (CommonJS plus types). Turbo builds it before dev, lint, typecheck and test. `packages/ui` stays source only (only Next uses it, via transpilePackages).
- **Status:** Proposed, review at the Day 1 sync

### D-006 · Health answers 503 when degraded
- **Date:** 2026-09-23
- **Raised by:** Dev B
- **Doc affected:** docs/06-api-contract.md (GET /health)
- **Problem:** docs/06 gives the body only. Render health checks and uptime monitors read the status code.
- **Decision:** same body, HTTP 200 when db and redis are ok, 503 when either is down. `Cache-Control: no-store`.
- **Status:** Proposed, review at the Day 1 sync

### D-007 · Next.js agent files turned off
- **Date:** 2026-09-23
- **Raised by:** Dev A
- **Doc affected:** AGENTS.md
- **Problem:** `next dev` writes its own AGENTS.md and CLAUDE.md into apps/web when it runs under an AI tool. They contain em dashes and would fail `pnpm check:dashes` for everyone.
- **Decision:** `agentRules: false` in apps/web/next.config.ts. Its one useful hint (read the Next.js docs bundled in node_modules) is now hard rule 12 in the root AGENTS.md.
- **Status:** Proposed, review at the Day 1 sync

### D-008 · Audit overrides for the Prisma CLI
- **Date:** 2026-09-23
- **Raised by:** Dev B
- **Doc affected:** docs/17-deployment.md (CI audit step)
- **Problem:** `pnpm audit --prod` reported 2 high and 1 moderate advisories in `mysql2` and `deepmerge-ts`, both pulled in by the Prisma CLI. CI fails on high.
- **Decision:** pnpm `overrides` pin `mysql2@3.24.4` and `deepmerge-ts@8.0.2`. Prisma generate, validate and migrate diff verified after the change. Remove the overrides once Prisma ships patched versions.
- **Status:** Proposed, review at the Day 1 sync

### D-009 · Render build command runs the db:deploy script
- **Date:** 2026-09-23
- **Raised by:** Dev B
- **Doc affected:** docs/17-deployment.md (Render)
- **Problem:** `pnpm --filter api prisma migrate deploy` fails: pnpm looks for a script named `prisma`, not the binary.
- **Decision:** the build command ends with `pnpm --filter api db:deploy` (script: `prisma migrate deploy`). Any other Prisma CLI call uses `pnpm --filter api exec prisma ...`. docs/17 updated.
- **Status:** Proposed, review at the Day 2 sync

### D-010 · Component test tooling for packages/ui
- **Date:** 2026-09-23
- **Raised by:** Dev A
- **Doc affected:** docs/04-tech-stack.md (Testing), docs/14-testing-qa.md (Component tests)
- **Problem:** docs/14 asks for component tests with Testing Library, but docs/04 does not list the packages they need.
- **Decision:** allowed as dev dependencies of `packages/ui` (and later `apps/web`): `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`. Vitest runs with `environment: "jsdom"` there.
- **Status:** Proposed, review at the Day 2 sync

### D-011 · Allow esbuild build script in pnpm-workspace.yaml
- **Date:** 2026-09-24
- **Raised by:** Dev A
- **Doc affected:** docs/04-tech-stack.md (Runtime and tooling)
- **Problem:** pnpm 11 ignores build scripts by default, causing ERR_PNPM_IGNORED_BUILDS when installing esbuild (required by vitest).
- **Decision:** add esbuild: true to allowBuilds in pnpm-workspace.yaml.
- **Status:** Proposed, review at the Day 2 sync

### D-012 · Refresh race: one winner, no family revoke
- **Date:** 2026-09-27
- **Raised by:** Day 3 review
- **Doc affected:** docs/12-security.md (A07), docs/06-api-contract.md (POST /auth/refresh)
- **Problem:** two tabs refreshing with the same cookie at the same moment could both rotate (two live tokens), or, with strict reuse detection, log the user out everywhere.
- **Decision:** the token is claimed atomically. The loser gets 401 without revoking the family; any later use of that old token is reuse and revokes the family. The web client should single flight refresh across tabs too (Web Locks or BroadcastChannel) on Day 4.
- **Status:** Proposed. Day 4: web side built (`navigator.locks` "apt-refresh" around the refresh call, see `apps/web/lib/api.ts`). Confirm at the Day 4 sync

### D-013 · Refresh cookie drops Secure only in local development
- **Date:** 2026-09-27
- **Raised by:** Day 3 review
- **Doc affected:** docs/06-api-contract.md (Basics, Auth)
- **Problem:** docs/06 says `Secure`. Day 3 set it only when APP_ENV was production, so staging cookies were not Secure. Safari refuses Secure cookies on http://localhost.
- **Decision:** `Secure` whenever APP_ENV is not development. A failed refresh also clears the cookie so the web route guard (cookie present) does not trust a dead token.
- **Status:** Proposed, review at the Day 4 sync

### D-014 · Scrim token for overlays
- **Date:** 2026-09-27
- **Raised by:** Day 3 review
- **Doc affected:** docs/09-design-system.md (Colour)
- **Problem:** Dialog and Sheet used `bg-black/60`, which does not exist in our theme, so they had no dimmed backdrop.
- **Decision:** new token `--scrim` (light `rgb(14 22 33 / 0.6)`, dark `rgb(0 0 0 / 0.7)`) as `bg-scrim`.
- **Status:** Proposed, review at the Day 4 sync

### D-015 · Question: short Telugu label for "Track bus" in the bottom nav
- **Date:** 2026-09-27
- **Raised by:** Day 3 review
- **Doc affected:** docs/10-ux-writing.md (Glossary, nav.track)
- **Problem:** at 360 px the glossary value "బస్సును ట్రాక్ చేయండి" needs three lines in the bottom nav. It is clamped to two lines with an ellipsis (screen readers still get the full label).
- **Decision:** open. Option: add `nav.trackShort` ("Track" / a short Telugu term) for the bottom nav only. Needs a native speaker.
- **Status:** Proposed, review at the Day 4 sync

### D-016 · Question: how the web route guard knows a session exists
- **Date:** 2026-09-27
- **Raised by:** Day 3 review
- **Doc affected:** docs/06-api-contract.md (Basics, Auth), docs/08-roles-permissions.md (web route guards), prompts/day-04.md (Dev A step 3)
- **Problem:** Day 4 asks the Next proxy to redirect when the `apt_rt` cookie is missing, but `apt_rt` has `Path=/api/v1/auth`, so the browser never sends it with page requests. The guard would always redirect.
- **Decision:** open. Proposal: the API also sets `apt_session=1` (httpOnly, Secure outside development, SameSite=Lax, Path=/, same max age) on verify and refresh, and clears it on logout and failed refresh. It carries no secret; the proxy only checks it exists. Widening `apt_rt` to `Path=/` instead would send the refresh token with every request.
- **Status:** Built on Day 4 exactly as proposed (API sets and clears `apt_session`, `apps/web/proxy.ts` checks it, the root layout uses it to decide on a silent refresh). Confirm at the Day 4 sync, then docs/06 and docs/08 get a line each

### D-017 · Web gets zod, @tanstack/react-query and vitest
- **Date:** 2026-09-30
- **Raised by:** Day 4
- **Doc affected:** docs/04-tech-stack.md (none changed, all three are listed)
- **Problem:** `apps/web` had none of them. The API client types response schemas with zod, the session uses React Query, and the client, roles and proxy need unit tests.
- **Decision:** add `zod` 4.6.5 (same pin as shared and api), `@tanstack/react-query` 5 and `vitest` 4.1.11 (dev) to `apps/web`. `apps/web` now has a `test` script, so Turbo runs it.
- **Status:** Proposed, review at the Day 4 sync

### D-018 · Day 4 network contract details and seed alignment
- **Date:** 2026-09-30
- **Raised by:** Day 4
- **Doc affected:** docs/06-api-contract.md (Network, search, timetable), docs/19-seed-data.md
- **Problem:** docs/06 names the shapes but not every field. The Day 2 seed also differed from docs/19: `baseFarePaise` equal to the minimum fare (Kurnool to Vijayawada Express came out at Rs 561, not Rs 541) and only part of the docs/19 timetables.
- **Decision:** (1) `BusStandRouteDto.destination` is `{ id, nameEn, nameTe }`; `RouteDto` has `origin`, `destination` and ordered `stops[]` (`stopId, seq, nameEn, nameTe, kind, lat, lng, kmFromOrigin, minutesFromOrigin, isBoarding, isDropping`); `TimetableDto` also returns `date` (defaults to today IST); a place `id` is the stop id used by search. (2) `TripSummaryDto.farePaise` is the total per passenger including the reservation fee. (3) Seed fixed to docs/19: base fare 0, fare rules updated on re-seed, all docs/19 timetables (456 incl. reverse), trips inserted in batches, older timetables deactivated. Run `pnpm db:reset` (or `pnpm db:seed`) on every branch.
- **Status:** Proposed, review at the Day 4 sync

### D-019 · Day 5 booking and trip detail contract details
- **Date:** 2026-10-03
- **Raised by:** Day 5 review
- **Doc affected:** docs/06-api-contract.md (Trips and booking), docs/13-realtime-tracking.md (Redis keys)
- **Problem:** docs/06 does not say how the client knows booking is closed, what `useFreeTravel` does before passes exist, or how `Idempotency-Key` handles a different body. docs/13 gives `hold:{tripId}:{seatNo}` 600 s but not `holdcount:{tripId}`.
- **Decision:** (1) `TripDetailDto.bookingOpen` (server computed: trip SCHEDULED or RUNNING and boarding stop departs after `booking.closeMinutesBefore`). (2) Until Day 8, `useFreeTravel: true` returns 422 `ELIGIBILITY_REQUIRED`; the server never prices a ticket at zero on the client's word. (3) `Idempotency-Key` must be a uuid; same key and body returns the first booking for 24 h, same key with a different body is 400 `VALIDATION_FAILED`. (4) Holds are placed and released by one Lua script each; a release only deletes keys whose value is the booking id. Hold keys live `holdMinutes x 60 + 60` s so the expiry job still counts them; `holdcount:{tripId}` lives 60 s longer than the newest hold. (5) Booking ids are generated by the API before the hold, so the hold value is the real id from the start.
- **Status:** Proposed, review at the Day 5 sync

### D-020 · Day 6 payment edge cases and booking draft
- **Date:** 2026-10-03
- **Raised by:** Day 6
- **Doc affected:** docs/06-api-contract.md (Payments), docs/07-ticket-and-pass-rules.md (section 2, first row)
- **Problem:** docs/06 and docs/07 do not say what verify returns when the money arrives but no tickets can be issued, whether a late payment with still free seats is honoured, or how a bad webhook signature answers.
- **Decision:** (1) A late payment is honoured when the booking is not cancelled, the trip is not cancelled or completed, and no ticket or other hold has the seats. Otherwise the full amount is refunded at once (refunds row with reason `LATE_PAYMENT_SEATS_UNAVAILABLE`, audit `refund.create`) and verify returns 410 `HOLD_EXPIRED`. (2) A second captured payment for an already confirmed booking is refunded the same way (`DUPLICATE_PAYMENT`). (3) Moving the payments row out of CREATED or FAILED is the claim that makes `confirmBooking` idempotent between verify and webhook. (4) Webhook: bad signature is 400 `VALIDATION_FAILED`; every verified delivery answers 200, failures are kept in the `payment.webhook` audit row. (5) `/payments/orders` returns 200 (not 201) and reuses the open CREATED order. (6) The web booking flow keeps its draft (segment, seats, typed passengers, booking id) in session storage per trip (`lib/booking-draft.ts`).
- **Status:** Proposed, review at the Day 6 sync

### D-021 · Day 7 ticket engine details
- **Date:** 2026-10-03
- **Raised by:** Day 7
- **Doc affected:** docs/07-ticket-and-pass-rules.md (section 4), docs/06-api-contract.md (Tickets, Payments test endpoint)
- **Problem:** docs/07 says `HMAC_SHA256(rotSecret, step)` and "base32" without the exact bytes; docs/06 names TicketDto fields only loosely; the demo needs a ticket inside its activation window.
- **Decision:** (1) The HMAC message is the step as 8 bytes big endian (as in TOTP); base32 is RFC 4648 (`A-Z2-7`); the token signature covers `APT1.<payload>`. Fixed vectors in `packages/shared/src/qr.test.ts`. (2) `TicketSummaryDto` and `TicketDto` as in `packages/shared/src/schemas/tickets.ts`; `displayStatus` is the live trip status, the ticket status is `status`. (3) Upcoming means BOOKED until `expiresAt`, or ACTIVE or SCANNED until `validUntil`; everything else is Past. (4) Every ticket status change publishes one domain event, `ticket.status` (from, to). (5) With `PAYMENTS_FAKE=1` the API uses `FakePaymentProvider` for every payment call, so dev and CI never reach Razorpay. (6) Demo trip in the window: `pnpm --filter api demo:window <ticket code> [minutes]` moves that ticket's trip (dev only). (7) "View ticket" on the confirmation goes to `/tickets` until the ticket page lands on Day 8.
- **Status:** Proposed, review at the Day 7 sync

## Parked (ideas outside the 20 day scope)

| Idea | Raised by | Plan sec |
| --- | --- | --- |
| | | |
