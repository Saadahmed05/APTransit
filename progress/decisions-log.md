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

### D-022 · Day 8 gifting, passes and free travel details
- **Date:** 2026-10-05
- **Raised by:** Day 8
- **Doc affected:** docs/06-api-contract.md (Tickets, Passes and free travel, Payments), docs/07-ticket-and-pass-rules.md (sections 7 to 9), docs/04-tech-stack.md
- **Problem:** docs/07 says a gift sets "passenger name" but tickets have no name column (the name lives on `booking_passengers`); docs/06 does not give the pass, eligibility and transfer shapes or the error for activating a pass that is not READY; the ticket page needs the trip id and the validUntil it would get before activation.
- **Decision:** (1) A gift renames the ticket's own `booking_passengers` row (one row per seat), so `TicketDto.passengerName` follows the holder. (2) `TransferTicketInput.recipient` accepts an email or an Indian mobile (+91 optional, spaces allowed), normalised by `normalizeRecipient` in shared; the answer is `{ ticketId, recipientMasked }`. Denials are audited as `ticket.transfer_denied` with the code. (3) Shapes in `packages/shared/src/schemas/passes.ts`: `PassTypeDto`, `PassDto` (adds `activateBy` and `canActivate`), `StreeShaktiCheckInput` (strict: any unknown key is 400), `EligibilityCheckDto`. The category is a code (`WOMAN`, `GIRL`, `TRANSGENDER` covered); other codes get NOT_ELIGIBLE `CATEGORY_NOT_COVERED`. Reason codes: `CONSENT_REQUIRED`, `CATEGORY_NOT_COVERED`, `DOMICILE_REQUIRED`. (4) Activating a pass that is not READY, or after `activateBy`, is 422 `PASS_NOT_ELIGIBLE`; a second ACTIVE pass of a kind (or a second open free travel pass) is 409 `PASS_ALREADY_ACTIVE`. (5) A free travel pass is valid until `min(activatedAt + durationDays, eligibility expiresAt)`. (6) `POST /payments/orders` takes `{ bookingId }` or `{ passId }` (strict union); verify returns `{ kind: "PASS", passId }`; money for a pass that is no longer PENDING_PAYMENT is refunded in full (`PASS_NOT_PAYABLE`) and verify answers 409 `BOOKING_NOT_PAYABLE`. A retried Buy within 30 min reuses the unpaid pass. (7) Free travel booking: one passenger, an ACTIVE unexpired FREE_TRAVEL pass, `busType.freeTravelEligible` and the service type in the pass list, else 422 `PASS_NOT_ELIGIBLE`; the ticket is made by `BookingConfirmationService.confirmFreeTravel` (still the only ticket factory). (8) `TicketSummaryDto.tripId` and `TicketDto.activationValidUntil` (server computed) added. (9) `@types/qrcode` added as a web dev dependency (types only for the listed `qrcode`).
- **Status:** Proposed, review at the Day 8 sync

### D-023 · Day 9 notifications, expiry jobs and screens
- **Date:** 2026-10-05
- **Raised by:** Day 9
- **Doc affected:** docs/05-data-model.md (notifications.params), docs/06-api-contract.md (Notifications, Health), docs/10-ux-writing.md (Notifications), docs/07-ticket-and-pass-rules.md (section 2 jobs)
- **Problem:** docs/05 stores `params` as JSON but does not say what goes in it, while the inbox and the emails show the text in two languages; docs/07 lists the job transitions but not how "once" works for PASS_EXPIRING; emails cannot use the UI tokens.
- **Decision:** (1) `notifications.params` are language neutral: names as `<key>En` and `<key>Te`, times as ISO (`departureAt` gives `{date}` and `{time}`, `validUntil` gives `{when}`). `notificationParams` in shared turns them into message params for the web inbox and the API emails alike; the copy is never stored. (2) packages/shared builds its `messages/*.json` into `dist` (`resolveJsonModule`), and `notificationText` and `emailText` format `{name}` placeholders (these strings have no plurals). New keys `email.layout.open` and `email.layout.footer`. (3) Links: BOOKING_CONFIRMED to `/tickets/<id>` for one ticket else `/tickets`; TICKET_ACTIVATED and TICKET_RECEIVED to the ticket; PASS_EXPIRING to `/passes?pass=<id>`, and that link is what makes it "once" (lookup on user, type, link). (4) Email jobs use job id `email-<notificationId>`, 3 attempts with backoff; the worker skips an already emailed row. (5) Expiry runs every 5 min (`expire-statuses` on the expiry queue, upserted scheduler): BOOKED uses `tickets.expiresAt` (the activation window close, so a later delay must move `expiresAt`, Day 12); SCANNED becomes USED on validUntil or a COMPLETED trip; batches of 500 with the old status as the optimistic lock; ticket changes publish `ticket.status`. (6) `GET /health` adds `worker: ok | stale` from `worker:heartbeat` (SET every 60 s, TTL 180); it does not change `status`, so the API is not restarted for a slow worker. (7) Email HTML uses inline fallback colours (email clients cannot load tokens.css); this is the one place outside tokens.css with colour values. (8) `TicketDto.giftCutoffAt` and `PassDto.activationValidUntil` are server computed so the web never repeats a rule. (9) Free seat path is `/book/[tripId]/free` (one seat, no payment step), shown on the bus page only to a logged in citizen with an active free travel pass on an eligible bus.
- **Status:** Proposed, review at the Day 9 sync

### D-024 · Day 10 PWA and end to end test details
- **Date:** 2026-10-05
- **Raised by:** Day 10
- **Doc affected:** docs/04-tech-stack.md (PWA), docs/14-testing-qa.md (E2E), docs/17-deployment.md (CI e2e job)
- **Problem:** the manifest needs colour values while raw colours may only live in tokens.css; the e2e suite logs in more than the docs/12 OTP limit allows (10 requests per IP per hour); E2E-3 needs a ticket inside its activation window.
- **Decision:** (1) `app/manifest.ts` reads `--bg` and `--primary` from `packages/ui/src/tokens.css` (`lib/token-values.ts`); `scripts/make-icons.mjs` draws the icons from the same tokens. (2) `public/sw.js` as in its header comment: precache `/offline` and icons, navigations network first (4 s) then cache then `/offline`, `/_next/static` cache first, `/api/v1` never cached except GET tickets and passes (network first), user caches cleared on logout (`CLEAR_USER_DATA`), new versions wait for "Update available" and Reload. Registered only in production builds. (3) Playwright `e2e/fixtures.ts` logs one citizen and citizen2 in per worker and keeps the context; a full run on both projects is 6 OTP requests. (4) E2E-3 runs `pnpm --filter api demo:window` (dev only) to open the window; tests book a trip leaving at least 3 h from now (`pickTrip`), because E2E-3 moves one trip. (5) CI e2e job resets the test branch with `prisma/reset.ts`, runs every spec, keeps an html report and uploads it on failure. (6) `@axe-core/playwright` added as a web dev dependency (listed in docs/04).
- **Status:** Proposed, review at the Day 10 sync

### D-025 · Day 11 driver, GPS trust and sockets
- **Date:** 2026-10-05
- **Raised by:** Day 11
- **Doc affected:** docs/06-api-contract.md (Driver, tracking; WebSocket), docs/12-security.md (GPS trust), docs/13-realtime-tracking.md
- **Problem:** docs/06 names the driver and tracking shapes loosely; docs/12 says "speed under 120 km/h" without saying how it is measured, while the simulator replays routes faster than real time; docs/13 asks for an offline buffer while docs/12 refuses points older than 2 min; the seed gives every KNL trip to one driver and one device.
- **Decision:** (1) Shapes in `packages/shared/src/schemas/tracking.ts` (`DriverTodayDto` adds `startableFrom` and `thisDevice` from the `X-Device-Key` header, `LiveTripDto`, `LiveBusDto`, `IncidentDto`, socket payloads), plus `GET /driver/trips` (today's assignments, used by the simulator). (2) Start is allowed from 60 min before to 60 min after departure and needs an approved device; start sets the bus RUNNING and end sets it IDLE. Not running is 409 `TRIP_NOT_STARTABLE`. (3) A ping is refused as a whole when any point fails: AP box plus about 50 km, reported `speedKmh` under 120, `recordedAt` within 2 min; refusals are counted in `gps:rejected:{tripId}`. Speed implied between points is not checked yet (the simulator compresses time); add it in the Day 17 hardening pass. (4) The driver app drops buffered points older than 110 s when it flushes, since the API refuses them; the live position resumes at once. (5) `/tracking/live` reads RUNNING trips from Postgres and positions from Redis; `depot:live:{depotId}` is maintained on start and end as docs/13 says. (6) The gateway authenticates in Socket.IO middleware (a subscribe sent right after connect raced the token check); emits come from domain events (`trip.status`, `bus.position`, `incident.created`, and `ticket:status` to `user:{id}`). (7) `pnpm simulate --all` shares a budget of 25 pings a minute across trips (one driver, one device). (8) Incidents of type BREAKDOWN set the bus BREAKDOWN; the location comes from bus:live, else the last sample, else the last reached or first stop. (9) socket.io, @nestjs/websockets, @nestjs/platform-socket.io (api) and socket.io-client (web, and api dev for tests) installed as listed in docs/04.
- **Status:** Proposed, review at the Day 11 sync

### D-026: Day 12 live tracking and scan implementation
- **Date:** 2026-10-05
- **Raised by:** Day 12
- **Doc affected:** docs/06-api-contract.md, docs/13-realtime-tracking.md
- **Decision:** Shared conductor schemas add earlierScanAt to duplicate scan responses; LiveTripDto adds incident flags and types. Notifications use deterministic IDs for durable deduplication. Prisma's relationJoins preview is enabled to load narrowly selected validation relations in one query. MapLibre is exported from a lazy UI subpath only. Simulator delay minutes use server wall time even when movement speed is accelerated, since trusted GPS timestamps cannot advance the server clock.
- **Status:** Proposed, review at the Day 12 sync

### D-027: Day 13 manual scanner validation
- **Date:** 2026-10-05
- **Raised by:** Day 13
- **Docs affected:** docs/07-ticket-and-pass-rules.md section 5, docs/06-api-contract.md validation, docs/11-screens.md conductor scanner
- **Question:** Day 13 requires manual ticket-code entry, but the validation contract accepts a signed QR and rotating code only. How must manual entry prove possession of the live ticket?
- **Proposed approach:** Require the ticket code plus its current eight-character rotating code. Keep the same assignment, status, trip, date and eligibility checks, scan/audit records and race protection. Display the live code on the passenger's active ticket for this fallback. A ticket code alone must not silently bypass live-code verification.
- **Status:** Approved by the human: ticket number plus current live eight-character code, unchanged backend validation checks.

### D-028: Day 13 operations and scanner contracts
- **Date:** 2026-10-05
- **Decision:** Operations request/response schemas live in shared/schemas/ops.ts. Conductor today adds bilingual route names; validation adds reason context without exposing secrets. A conductor:counts trip-room event invalidates authenticated manifest queries after scans. Device DTOs exclude key hashes. Scan result tones/icons are defined in shared/status.ts.
- **Status:** Proposed for the other dev's contract review. Locked docs unchanged.

### D-029: Day 14 admin and operations contracts
- **Date:** 2026-10-06
- **Decision:** Admin payloads and response schemas live in `packages/shared/src/schemas/admin.ts`. Ordered route stops are replaced atomically and the encoded polyline is regenerated from stop coordinates. Fare history is append-only and selected at the scheduled departure timestamp. Refund policies retain history: one row is marked active as the latest configuration, while the effective policy is the latest row with validFrom at or before the current time. A future configuration must not suppress the current effective policy. Admin mutations invalidate cached network settings.
- **Contracts:** Scoped GET /ops/depots, /ops/bus-types and /ops/routes support the dashboard forms. Bus responses add optional current bilingual route and driver names. Incident status labels, icons and tones are centralized in shared/status.ts. Depot audit reads use the audited entity's depot in before/after snapshots, not the actor's current roles, which may span several depots. State roles retain global audit access.
- **Status:** Proposed for the other dev's shared contract review. Locked docs unchanged.

### D-030: Day 15 review fixes, indexes and analytics definitions
- **Date:** 2026-10-07
- **Raised by:** Day 15 review before Day 16
- **Docs affected:** docs/05-data-model.md (indexes beyond the minimum), docs/06-api-contract.md (gov and analytics shapes, additive)
- **Decision:**
  - Indexes (migration 20261007000000_query_indexes): foreign key and range indexes on bookings(tripId), booking_passengers(bookingId), tickets(bookingId), tickets(passengerId), ticket_scans(tripId, scannedAt), ticket_scans(ticketId), ticket_scans(passId), ticket_transfers(ticketId), payments(bookingId), payments(passId), refunds(paymentId), refunds(ticketId), trip_assignments(tripId), trip_assignments(busId, startedAt), incidents(tripId), maintenance_records(busId, startAt), complaints(depotId, createdAt), daily_stats(date, routeId). Without them cascade deletes and per trip joins scanned whole tables.
  - daily_stats levels: route rows carry routeId (plus depot and district), depot rows depotId and districtId, district rows districtId only, and one state row has no ids. revenuePaise = captured payments minus processed refunds of the trips of that date. passengers = valid tickets plus valid pass scans; ticketsSold = valid tickets. passesActive only on the state row (a pass has no place). complaints counted by route code, depot and district.
  - Analytics definitions (no doc defines them): load factor = valid tickets over seats of trips that were not cancelled. Bus utilisation = hours on completed trips over the hours in the range that were not downtime; downtime = maintenance records plus breakdown incidents (report to resolution) clipped to the range. Hours and demand bands use IST departure time; bands match search (05:00, 12:00, 17:00, 21:00). Delayed = 5 minutes or more (DELAY_DISPLAY_THRESHOLD_MIN); on the live map delayed means running late now. Ranges are at most 92 days.
  - Scope: gov, analytics and reports use depotScopeWhere(user, permission): only roles holding the permission count; district officers see their district, depot managers their depot for reports.
  - Shared contracts (additive): demandBandOfHour and demandLevelOf in schemas/analytics.ts; GovOverviewDto adds complaintsToday, openComplaints, avgHoursToResolve; GovDistrictMapItem adds lat and lng (district HQ bus stand).
  - Reports stream in pages, use names instead of ids, and prefix text that starts with = + - @ with an apostrophe (CSV injection).
- **Status:** Proposed for the other dev review. Locked docs unchanged.

### D-031: Day 16 feedback and complaints
- **Date:** 2026-10-07
- **Decision:** Shared contracts in schemas/feedback.ts (FeedbackInput, FeedbackStatusQuery and Dto, ComplaintDto, OpsComplaintsQuery, UpdateComplaintInput, COMPLAINT_NEXT_STATUS). Status moves one step at a time; a skipped step answers 409 COMPLAINT_STATUS_INVALID (new error code, messages in both web files). POST /feedback is limited to 5 per IP per hour even when logged in; GET /feedback/status to 20 per IP per 10 minutes. Depot comes from the ticket, else the bus (spaces ignored), else the route. Signed in senders get COMPLAINT_UPDATE in app plus account email; guests get an email to the address they gave, in the language of their request (locale cookie, else Accept-Language). Complaints without a depot are visible to statewide roles only. Email copy lives in packages/shared messages (email.complaint).
- **Offline scanning pack (stretch, ADR 003):** moved to the backlog. Not built in the 20 days; the conductor app keeps online validation.
- **Status:** Proposed for the other dev review. Locked docs unchanged.

### D-032: Day 17 and 18 security, operations and UI fixes
- **Date:** 2026-10-07
- **Decision:**
  - CSP is built per request in apps/web/proxy.ts with a nonce and strict-dynamic (Next 16 CSP guide). style-src allows unsafe-inline because MapLibre, Recharts and Radix set style attributes. The proxy now runs on every page (not only protected ones); the login redirect is unchanged.
  - MapLibre 6 worker: apps/web/scripts/copy-map-worker.mjs copies maplibre-gl-worker.mjs and maplibre-gl-shared.mjs into public/ before dev and build, and map-view.tsx calls setWorkerUrl. Before this the bundled map never loaded in production builds ("Worker failed to load").
  - Load tests: apps/api/scripts/load-pool.ts creates load test conductors (loadtest+NN@aptransit.test) on running trips and signs 1 hour tokens with JWT_SECRET, because one conductor is limited to 120 scans a minute. Never in production. Search load from one IP hits the 60 per minute limit by design.
  - Sentry (optional on Day 18): skipped. Not in docs/04; pino logs with request ids, the failed jobs summary and /health cover the demo.
  - /health adds workerAgeSec and queues (waiting, active, delayed, failed per queue). GET /admin/jobs/failed returns queue, id, name, reason, attempts, failedAt, never job data (policy:write, STATE_ADMIN and up).
  - Retention runs on the maintenance queue at 02:00 IST in batches of 10,000 rows; the failed jobs summary logs one line at 07:00 IST.
  - Class names that Tailwind silently dropped (bg-success/10, text-danger, border-border, text-xs, text-foreground and others in admin and ops screens) were mapped to theme classes; pnpm check:classes (scripts/check-classes.cjs) compares used classes with the built CSS.
- **Status:** Proposed for the other dev review. Locked docs unchanged.

### D-033: v2 minimal visual refresh
- **Date:** 2026-10-08
- **Raised by:** Dev A (v2 phase P1)
- **Doc affected:** docs/09-design-system.md (rewritten from prompts/v2-design-spec.md)
- **Decision:**
  - Token values change for light and both dark blocks; every token name stays, so one edit restyles every screen and E2E selectors survive. New tokens: `--surface-sunken`, `--border-subtle` (class `border-hairline`, because `border-subtle` would clash with the `text-subtle` colour), `--dur-hold`.
  - Type scale: display 32 / 40, new display-lg 40 / 48, h1 24 / 32, h2 20 / 28, h3 17 / 24, with tracking (0 in Telugu). Radius 8, 12, 16, 24. Cards and tabs lose their shadows; shadow is for floating layers only. Blur is removed from sheet and dialog scrims.
  - No new dependency. Four new components in packages/ui: BottomNav, StatusChip, ResultSplash, HoldButton. The field apps adopt BottomNav in P6.
  - A contrast test (`packages/ui/src/tokens.test.ts`) reads tokens.css and asserts AA (text 4.5, borders 3) in all three theme blocks.
  - Two small deviations from the spec: the scan result auto reset is a draining bar (transform only) instead of a ring, because the spec limits motion to transform and opacity; the dialog max width stays `max-w-lg` (512 px) instead of 480 px, to avoid an arbitrary value.
- **Status:** Proposed for the other dev review. docs/09 updated in the same PR (P1).

## Parked (ideas outside the 20 day scope)

| Idea | Raised by | Plan sec |
| --- | --- | --- |
| Offline scanning pack and batch validation (ADR 003) | Day 16 stretch | 77 |
