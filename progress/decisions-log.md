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

### D-034: v2 state model and multi state scope
- **Date:** 2026-10-09
- **Raised by:** Dev B (v2 phase P2)
- **Doc affected:** docs/05 (states, stateId columns), 06 (GET /states, stateId on gov reads and role grants, state:<id> room), 08 (state scope), 12 (GPS box per state), 13 (rooms, map view), 19 (AP state, `--with-tg`), 18 (G15), 04 (Next 16.3.8 housekeeping)
- **Problem:** District was the top level and AP was hardcoded (GPS box, map centre, time zone literals, the single `state` room, gov breadcrumb). A second state needed a rebuild.
- **Decision:**
  - Network is State > District > Depot > Route > Bus > Trip. New `states` table (code, names, timezone, codePrefix, bounds, centre, zoom, isActive). `districts.stateId` required; `user_roles.stateId`, `pass_types.stateId` (null = every state) and `daily_stats.stateId` nullable. Two migrations: `20261009000000_states` (table and nullable columns), `20261009000100_states_backfill_ap` (AP with the fixed id `stateap000000000000000000`, backfill, then districts.stateId NOT NULL). No enum change.
  - Scope: SUPER_ADMIN is the only platform wide role. STATE_ADMIN and TRANSPORT_OFFICER see their state (`depot.district.stateId`); without a stateId they see nothing. `depotScopeWhere`, `isPlatformWide`, `wholeStates` and `ScopeService.assertStateAccess / assertDistrictAccess / assertDepotAccess` (now async, state aware) are the one implementation; ops, tracking, gov, analytics, reports, feedback and admin all use them. A STATE_ADMIN grants roles only inside their state. Complaints without a depot have no place: state and platform roles see them, and they count in every state row.
  - Sockets: the `state` room is now `state:{id}`; the trip's state comes from route > depot > district (cached 5 min per district in TripContextService). Web and API must deploy together.
  - GPS trust box is the trip's state bounds plus 0.5 degrees longitude and 0.45 latitude (the old AP box exactly).
  - `GET /states` (public). The plan said `/network/states`; network endpoints live at the root (`/districts`), so it is `/states`. The web called `/network/districts` (a 404, so breadcrumbs showed "District"); fixed to `/districts`.
  - `/gov/overview` and `/gov/map` take `stateId?` (403 outside the caller's scope). Rollups write one state row per active state and stateId on every row. `/gov` shows a state picker for SUPER_ADMIN; `/gov/state/[id]` is one state's command center; the breadcrumb root is the state name from the API. Maps take `bounds` (state from the API, AP as the fallback).
  - `PLATFORM_TIME_ZONE = "Asia/Kolkata"` in packages/shared time.ts; no other literal in code (SQL uses it through `Prisma.raw` or a parameter). `State.timezone` must equal it until per state zones exist (backlog). There is no admin screen for states yet (states arrive by migration or seed); whoever builds one must refuse a different zone.
  - The `APT-` ticket and `APT1` QR prefixes stay platform wide. Generic copy no longer says "Andhra Pradesh" (app description, admin stops, gov map legend); free travel copy keeps it because the scheme is AP's.
  - Seed: AP state row; `pnpm db:seed --with-tg` adds a Telangana stub (2 districts, bus stands, depots, `admin.tg@aptransit.test`).
  - Test note: the plan's "TG point rejected for an AP trip" cannot hold with real bounds, because AP's rectangle contains all of Telangana. The test instead checks a Hyderabad point accepted for TG, and Visakhapatnam and Tirupati accepted for AP but rejected for TG.
  - Housekeeping: docs/04 now lists Next 16.3.8 (advisory GHSA-cjq9-62q9-8jv4, already on main).
- **Status:** Proposed for the other dev review. Docs updated in the same PR (P2).

### D-035: v2 boarding record and segment validation
- **Date:** 2026-10-09
- **Raised by:** Dev B (v2 phase P3)
- **Doc affected:** docs/05 (ticket_scans, enums), 06 (POST /tickets/validate), 07 section 5
- **Problem:** a scan stored only ticket, trip, conductor and result. No bus, stop, location or device, and no check that the passenger boards inside the ticket's segment.
- **Decision:**
  - `ticket_scans` gains busId, stopId, stopSource (BUS_GPS, DEVICE_GPS, NONE), lat, lng, deviceId and validatorKind (CONDUCTOR, DOOR_SCANNER); conductorId becomes optional for door scanners (P5). Indexes (stopId, scannedAt) and (busId, scannedAt). The four new ScanReason values ship in their own migration before anything uses them. Old rows were backfilled with CONDUCTOR and the bus assigned at scan time (26,438 of 26,438 local rows got a bus).
  - One validation path: `ValidateService.validate(ctx: ValidatorContext, input, actor)`. The conductor endpoint builds the context from the running assignment (`validateAsConductor`); P5 builds it from the paired scanner.
  - Boarding stop rule (pure `resolveBoardingStop`): bus GPS newer than 60 s, nearest route stop within 400 m with seq not past the next stop (BUS_GPS); else the device `position` inside the state box, bounded by the trip's last stop plus one (DEVICE_GPS); else NONE. NONE skips every stop check.
  - New checks in docs/07 section 5 order: 10a PAST_DESTINATION (at or after the dropping stop), 10b BEFORE_BOARDING_STOP (more than 1 stop before the boarding stop), 10c NOT_YET_VALID (pass before validFrom), 11a ROUTE_NOT_COVERED (route restricted pass). 11a is wired but always passes until P4 adds route restricted passes.
  - `ValidateTicketInput.position` (optional) and `context.boardingStop`, `ticketFrom`, `ticketTo`, `validFrom` in the result; scanner helpers say "This ticket ends at Nandyal". The conductor web app does not send its own position yet (it would need a location prompt; P5 and P6 decide).
  - The plan also named SCAN_RESULT_MAP in status.ts: result level tone and icon are unchanged, so it was left as is; reasons are copy only.
- **Status:** Proposed for the other dev review. Docs updated in the same change (P3).

### D-036: v2 pass catalog
- **Date:** 2026-10-09
- **Raised by:** Dev B then Dev A (v2 phase P4)
- **Doc affected:** docs/05 (enums, pass_types, passes), 06 (POST /passes stops, POST /eligibility/student, /admin/pass-types), 07 section 8, 18 (G16 to G18), 19 (pass types)
- **Problem:** only Weekly, Monthly and Free travel existed; validity was always activation plus N days; a pass boarded one person per trip; a price edit on the type would have changed sold passes.
- **Decision:**
  - New kinds DAY, FAMILY, SCHOOL, ANNUAL and scheme STUDENT in their own migration. `PassValidityMode` ROLLING_DAYS or UNTIL_DAY_END (23:59:59 IST of the activation day). Pass types gain validityMode, groupSize, routeRestricted, isDemo, sortOrder.
  - Every pass copies price, duration, mode, services and group size at purchase (plus home and destination stops for SCHOOL); payments, validation and the pass screens read the copy. Existing passes were backfilled from their type (139 of 139 locally). So "changes apply to new sales only" holds by construction.
  - Group rule replaces "once per trip": at most groupSize VALID scans of a pass on one trip, counted under the existing pass row lock; the result carries `group: { boarded, size }` and the scanner shows "2 of 4 boarded".
  - SCHOOL: a STUDENT eligibility check (consent, student declaration, institution name sent to the mock provider and never stored, no ID number); purchase needs both stops; valid only on routes holding both (check 11a ROUTE_NOT_COVERED, wired in D-035).
  - Admin: GET and POST /admin/pass-types, PATCH /admin/pass-types/:id (policy:write, zod, the admin rate limit, audit pass_type.create and pass_type.update). Kind, scheme and state cannot change after creation. Screen /admin/policies/pass-types.
  - **Prices are DEMO values pending client confirmation** (docs/18 G16 to G18): Day 120, Weekly 450, Monthly 1,600, Family 1,000, School 600, Annual 15,000 rupees, in paise, `isDemo = true`, shown with a "Demo price" chip.
  - Web: /passes/buy is a list of cards with one Buy button each; /passes/school clones the free travel flow; pass cards show "Covers up to 4 people" and the school route.
- **Status:** Proposed for the other dev review. Prices pending client confirmation. Docs updated in the same change (P4).

### D-041: Login email failure answers 503 EMAIL_DELIVERY_FAILED
- **Date:** 2026-10-09
- **Raised by:** Dev B (v2 plan, section 1 "Login")
- **Doc affected:** docs/06 (status rules, error codes, POST /auth/otp/request)
- **Problem:** when Resend refuses a login email (the `onboarding@resend.dev` test sender only reaches the Resend account owner, so most Gmail addresses fail), the API answered 500 INTERNAL and the screen said "something went wrong".
- **Decision:**
  - New error code `EMAIL_DELIVERY_FAILED` with HTTP 503 (an outside service is unavailable, try again). Messages in both web files; the login form shows it through the existing `errors.<CODE>` lookup. Logs keep the Resend status only, never the body or the address.
  - With `OTP_DEV_ECHO` on (never in production) a failed email does not block login: the request answers 202 with `devCode`, the screen shows the test code, and a warning is logged. Other errors are never hidden.
  - Numbered D-041 because D-034 to D-040 are reserved for the v2 phases in prompts/v2-journey-plan.md.
  - Still needed outside the code (owner's accounts): verify a sending domain in Resend, set `EMAIL_FROM` on that domain and `APP_ENV=staging` on Render, then `OTP_DEV_ECHO=0`.
- **Status:** Proposed for the other dev review.
### D-042: v3 citizen features (owner request)
- **Date:** 2026-10-11
- **Raised by:** Product owner (field feedback), built on branch `a/v3-transit-ux`
- **Docs affected:** 02, 05, 06, 07, 09, 11, 12, 15, 18, 19
- **Decision:**
  - Theme: light blue and white (token values only, names unchanged, AA test passes). Bus opening animation on every full load (pure CSS, aria hidden, reduced motion aware).
  - Login first: `/` is in `PROTECTED_PREFIXES`; search, track and timetable stay public. E2E-1 and a11y now log in before home.
  - Home: Google Maps style From and To plus a MapLibre stop picker, "use my location", keyboard list. New public `GET /places/nearby`; `PlaceDto` gains optional `lat`, `lng`.
  - Search service fit (`villageFit`): a village end lists only `VILLAGE_SERVICE_TYPES` when any exist, else everything.
  - Group tickets: children under 12 pay 50 percent (`groupFare`, `splitGroupTotal`). Day pass, zone day and zone monthly passes (`zoneScoped`, `zoneDistrictId`). Child cards (`holderName`, `holderAge`) send `CHILD_BOARDED` to the parent on each valid scan. Migration `20261011000000_v3_passes_children`.
  - QR period 3 s (was 30), window plus or minus one step.
  - Passengers per stage on `GET /ops/trips/:id` (`stages`, `passBoardings`). Pass scans carry no stop yet.
  - Long journey route VJA-VSP-01 (overnight). Search shows "next day" arrivals. Terms page `/terms`; account links to passes, help and terms.
  - Prices and ages are assumptions **(A)**, listed in docs/18.
- **Status:** Built and tested locally. Needs the other dev review and owner confirmation of the (A) values.

### D-043: Sign in with Google
- **Date:** 2026-10-11
- **Decision:** Google Identity Services button on `/login` (popup). `POST /auth/google { credential }` verifies the ID token with Google tokeninfo (no new dependency), checks aud, issuer, expiry and verified email, finds or creates the user by email, issues the normal session. Optional env `GOOGLE_CLIENT_ID` (API) and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (web); unset hides the button and the API answers 403. CSP allows accounts.google.com/gsi. 10 per IP per minute.
- **Status:** Built. Needs a Google Cloud OAuth client id (docs/15) before it shows.

### D-044: Bus classes, one ticket for all buses, who gets down where
- **Date:** 2026-10-12
- **Raised by:** Product owner ("Our bus types and ticket rules" board, and a conductor request), built on branch `a/bus-classes`
- **Docs affected:** 06, 07 (section 5 checks 9 and 11, new section 7c), 11, 18
- **Decision:**
  - Three classes over the ten service types (`BusClass`, `SERVICE_BUS_CLASS`, `classCovers` in `packages/shared/src/bus-class.ts`). A ticket covers its own class and lower ones. The mapping is an assumption **(A)** in docs/18.
  - A ticket boards another bus the same day when that route runs through both of its stops in order and the class allows it. Server only, in `ValidateService`; no new scan reason (route failure stays `WRONG_TRIP`, class failure is `SERVICE_NOT_ELIGIBLE` with `context.ticketClass` and `busClass`). No seat on the other bus, no fare difference refunded **(A)**. No schema change, no migration.
  - `GET /conductor/trips/:id/alighting` (pure `alightingPlan` in `apps/api/src/modules/conductor/alighting.ts`): checked tickets per dropping stop ahead of the bus. Scanner banner and conductor home panel; refreshed after each scan and by the `conductor:counts` socket event.
  - Citizen: `/bus-types` page, class note on bus and ticket details, links from home, account and terms.
- **Status:** Built and tested locally. Needs the other dev review (shared contract change) and owner confirmation of the (A) items.

### D-045: Remove local bus seat booking
- **Date:** 2026-10-14
- **Raised by:** Product owner
- **Docs affected:** 06, 07, 11
- **Question:** The current locked rules allow reserved seat booking for every service type and do not define a local bus category. Confirm which service types are local. The likely choices are PALLEVELUGU, ULTRA_PALLEVELUGU, CITY_ORDINARY and METRO_EXPRESS, or only CITY_ORDINARY and METRO_EXPRESS. Also confirm whether the restriction includes the free reserved seat flow, and whether a direct `/book/:tripId` visit should show an explanatory unavailable state or return not found.
- **Proposed enforcement after confirmation:** Hide booking actions for confirmed local service types, guard every paid and free booking screen, reject `POST /bookings` on the server before creating holds, keep search, route, schedule and fare reads unchanged, and add web and API regression tests. Shared booking services and tables remain in place for other services.
- **Status:** Owner confirmed on 2026-10-14 that local means CITY_ORDINARY and METRO_EXPRESS, and that paid and free-travel reserved-seat booking are both blocked. Implemented in code and tests. Locked docs still need the other dev's agreement and a separate docs update. **Superseded in part by D-046 (2026-10-15):** the owner chose seatless booking for local buses, so the block on CITY_ORDINARY and METRO_EXPRESS was removed from code and tests.

### D-046: Seatless local travel, senior fares, local only Pallevelugu, Kurnool landmarks, Rapido style map
- **Date:** 2026-10-15
- **Raised by:** Product owner, built on branch `a/local-seatless`
- **Docs affected:** 05, 06 (`POST /bookings` passenger fields, `FareDto.seatless`), 07 (sections 4 and 7a), 11 (book screens), 18, 19 (new stops and routes). **Not edited yet:** docs are locked until both devs agree.
- **Decision:**
  - Seatless: Pallevelugu, Ultra Pallevelugu and City Ordinary are never booked by seat, and neither is any trip of 50 km or less on any service (`isSeatless`, `SEATLESS_MAX_KM` in `packages/shared/src/seatless.ts`, owner's numbers). The server hands out an internal seat label so the bus capacity (40 to 50 seats, the layout of the bus type) still caps the tickets; the label is never shown (`visibleSeat` in the tickets service, `FareDto.seatless` for the web). No schema change, no migration. A full bus answers `SEAT_TAKEN`.
  - Names: a seatless booking sends only ages. Passenger names come from the account (`Name`, `Name +1`, ...). Reserved (long) trips still need every name, gender and seat. `CreateBookingPassengerInput` makes name, gender and seatNo optional; the service refuses a reserved trip without them.
  - Senior citizens: 60 and over (owner). **(A)** The discount was not given: `SENIOR_FARE_PERCENT` is 50, like children, in `fare.ts`. `groupFare` and `splitGroupTotal` price adult, child and senior by age. The reservation fee is still charged on seatless tickets **(A)**.
  - Pallevelugu is local only: the 150 km Anantapur run now uses Ultra Deluxe and Express, and new local routes cover Adoni, Atmakur (via Nandikotkur) and Dhone to Nandyal (via Banaganapalle). `LOCAL_ROUTE_MAX_KM` is 130 **(A)**; a seed test fails if a local service runs a longer route.
  - Kurnool landmarks are stops (positions from OpenStreetMap): Jyothi Mall, Chandana Bros Shopping Mall, Jagdeesh Mall, Kurnool Medical College, Osmania College, G Pulla Reddy Engineering College, G Pullaiah College of Engineering and Technology, Kurnool City Railway Station. Two City Ordinary lines join them: `KCM-01` (malls) and `KCC-01` (colleges). Telugu names need a native review.
  - Map picker: Pickup and Drop rows with an active field, a tap on a stop sets it, a dashed A to B line, name pills on the pins, 44 px tap areas, first view centred on Kurnool.
  - The conductor "who gets down" feature already exists (D-044) and refreshes after every scan; local tickets feed it like any other.
- **Status:** Built and tested locally. Owner to confirm the **(A)** values (senior percent, 130 km, reservation fee on seatless tickets). Needs the other dev review (shared contract change).

### D-047: Proposed edits to locked docs for D-044 and D-046
- **Date:** 2026-10-16
- **Raised by:** Dev B (Mukheeth), from `prompts/next/README.md` task 6
- **Docs affected:** 05, 06, 07, 11, 18, 19. **Nothing is edited yet.** The other dev must agree and the decision be logged as Accepted before any doc changes.
- **Proposed text:**
  - **docs/05 (data model), `booking_passengers`:** change `name, age, gender (F, M, X), seatNo` to say that on a seatless trip `seatNo` holds an internal label (`L1`, `L2`, ...) that is never shown to users, and `name` is derived from the account (`Name`, `Name +1`). Seatless capacity is capped by the bus type seat count. `tickets.seatNo` stays nullable and is hidden from the citizen view when the trip is seatless (`visibleSeat`).
  - **docs/06 (API contract):** `POST /bookings` passengers: `{ name?, age, gender?, seatNo? }`. Name, gender and seat are required only when the trip is not seatless (`CreateBookingPassengerInput`); a seatless booking sends ages only. `GET /trips/:id/fare` response gains `seatless: boolean` and an adult, child and senior breakdown (`groupFare`). `GET /conductor/trips/:id/alighting` (D-044) is added to the conductor table.
  - **docs/07 (rules), section 4 and 7a:** add the seatless rule (Pallevelugu, Ultra Pallevelugu and City Ordinary, plus any trip of 50 km or less, are never booked by seat; reserved long trips still pick seats). Add the senior category: age 60 and over, **(A)** 50 percent of the adult base fare, next to the child rule (under 12, 50 percent). Add the local route limit **(A)** 130 km and that the reservation fee **(A)** is still charged on seatless tickets. Section 7c (D-044) already covers bus classes; keep it as is.
  - **docs/11 (screens):** the book screens gain a seatless variant: pickup and drop from the map picker, passenger ages only, no seat map, ticket without a seat line. The map picker home screen documents Pickup and Drop rows, a tap on a stop sets the active field, a dashed A to B line, name pills, 44 px tap areas, first view centred on Kurnool. The sign in screen lists links to the staff portals (driver, conductor, depot, government, admin).
  - **docs/18 (open decisions):** add the **(A)** values to the "v3 values to confirm" table: senior percent (50), seatless limit (50 km), local route limit (130 km), reservation fee on seatless tickets (charged).
  - **docs/19 (seed data):** add the 45 Kurnool spots as stops (OpenStreetMap positions, Telugu names pending native review), city lines `KCM-01`, `KCC-01`, `KHL-01`, `KCL-01`, `KOT-01`, and the local routes Adoni, Atmakur (via Nandikotkur) and Dhone to Nandyal (via Banaganapalle). Note that the 150 km Anantapur run now uses Ultra Deluxe and Express.
- **Status:** Proposed. Waiting for Dev A to agree. The owner still has to confirm the **(A)** values.

### D-048: Buses for the whole booking window, every class every hour, no details tickets, profile, map home, more Kurnool stops, field features
- **Date:** 2026-10-16
- **Raised by:** Product owner (Mukheeth), after testing production: "No buses for this date" for Kurnool to Vijayawada on 2026-10-16, and a button reading "{time}, next day".
- **Docs affected:** 05, 06, 07, 08, 11, 12, 13, 18, 19. **Not edited:** docs stay locked until both devs agree. Each phase adds its proposed text here as it ships.
- **Owner decisions (2026-10-16):**
  - Frequency: every intercity route runs an Express class bus and a Super Luxury class bus every hour, 05:00 to 23:00. Routes up to `LOCAL_ROUTE_MAX_KM` (130) also run Pallevelugu every 30 min (local buses every 30 min). Kurnool city lines run at least every 30 min, 05:00 to 23:00. Pallevelugu stays local only.
  - Tickets: no passenger names or gender. The traveller picks Adult, Child and Senior counts (different rates); long reserved trips then pick that many seats; local (seatless) buses never show seat selection anywhere.
  - Sign up: name, email and phone are required; the channel not used to log in is verified by a code.
  - Kurnool: keep the 45 spots and add about 40 more (schools, temples, markets, parks, university, stations) on city lines.
  - Defaults the owner did not object to: home is a full screen map with a From and To card and a bottom sheet; account gets profile and verify, travel hub, settings and help; driver and conductor get SOS, break, delay minutes, alerts, day list, conductor report, GPS with scans and a richer manifest. Offline scanning stays parked.
- **Phase 1, built 2026-10-16 (buses visible):**
  - Cause: trips were created only by the BullMQ worker (never deployed) and the seed made 8 days, so every date after the last seed plus 7 was empty, while the date picker allows 30 days.
  - `TripWindowService` (`apps/api/src/modules/trips/trip-window.service.ts`): on API boot and every 6 h it fills today to today plus `booking.daysAhead` (30), prunes unsold future trips of switched off timetables and applies the demo crew; a search for a date in the window with no trips generates that day first. The worker's daily job calls the same code under the same Redis lock.
  - Trip codes carry the service (`TRP-KNL-VJA-01-20261016-0500-EXP`) because two classes leave at the same minute; migration `20261017000000_trip_per_timetable_day` adds a unique (timetableId, serviceDate) so old and new codes never double.
  - Seed: the new timetable (about 1,800 trips a day), trips for the whole window, the demo crew from the `trips.autoAssign` setting (KCM-01 and MKC-02, demo driver and conductor) instead of one driver on every trip, and the city line minutes that went backwards fixed.
  - The empty search state's button uses `search.tryNextDay` ("Try the next day"); `search.nextDay` keeps the overnight arrival label.
- **Proposed doc text (Phase 1):**
  - docs/19 "Timetables": replace the table with: "Intercity routes (KNL-VJA, KNL-TPT, KNL-ATP, KNL-NDL, VJA-VSP, KNL-ADN, KNL-ATK, DHN-NDL): every hour 05:00 to 23:00 one Express class bus (Express, on routes over 130 km alternating with Ultra Deluxe) and one Super Luxury class bus (Super Luxury, from 20:00 Amaravati AC on KNL-VJA, Indra AC on KNL-TPT, Garuda AC on VJA-VSP). Routes up to 130 km also Pallevelugu every 30 min 05:00 to 23:00, every fourth Ultra Pallevelugu. VJA-GNT: Metro Express every 15 min, Super Luxury hourly, Pallevelugu every 30 min. VSP-SMC unchanged. Kurnool city lines KCM and KCC every 20 min, KHL, KCL and KOT every 30 min, 05:00 to 23:00. Reverse routes 30 min later."
  - docs/19: "Trips exist from today to today plus `booking.daysAhead`; the API fills the window on boot, every 6 h and on demand for a searched date; the worker runs the same fill nightly." Replace "today plus 7 days".
  - docs/05 `trips`: add "unique (timetableId, serviceDate)"; code format `TRP-{route}-{yyyymmdd}-{HHmm}-{service}`.
  - docs/18 (A): night AC slot from 20:00; Ultra Deluxe alternating on routes over 130 km; demo crew roster in the `trips.autoAssign` setting.
- **Phase 2, built 2026-10-16 (no details tickets, no seats on local buses):**
  - Shared: `PassengerCategory` (ADULT, CHILD, SENIOR) with `categoryFarePaise`, `groupFareByCategory`, `splitGroupTotalByCategory`, `categoriesFromCounts` in `packages/shared/src/fare.ts`; the age based `groupFare` and `splitGroupTotal` stay as wrappers. `CreateBookingPassengerInput` is `{ category?, age?, name?, gender?, seatNo? }` and needs a category or an age; `BookingPassengerDto` gains `category`, `age` is nullable. `seatless` on `TripSummaryDto` and `TripDetailDto`, `passengerCategory` on `TicketDto`, `category` on the scan result.
  - Migration `20261018000000_passenger_category`: `booking_passengers.category` (backfilled from age), `age` nullable, `gender` defaults to X.
  - API: every booking takes the account name (`Name`, `Name +1`, a masked email or phone when there is no name); reserved trips need only a seat per traveller; totals and ticket shares by category.
  - Web: step 1 "Who is travelling?" with Adult, Child and Senior counts and the price of each; local trips book there and go to payment; reserved trips pick exactly that many seats on `/book/[tripId]/seats`; the old details step redirects to step 1. Free travel on a local bus is one tap with no seat map; bus details and search say "Space for N" on local buses; the ticket and the conductor scan show the category.
- **Proposed doc text (Phase 2):**
  - docs/05 `booking_passengers`: "id, bookingId, name (the account name), category (`ADULT`, `CHILD`, `SENIOR`), age? (bookings before D-048), gender (default `X`, not asked), seatNo (a hidden label on seatless trips)".
  - docs/06 `POST /bookings`: "passengers: [{ category, seatNo? }] (1 to 6). seatNo is required on reserved trips and ignored on seatless trips. Older clients may send age instead of category." `GET /search/trips` and `GET /trips/:id` add `seatless`; `GET /tickets/:id` adds `passengerCategory`; the scan result `ticket` adds `category`.
  - docs/07 section 7a, replace the first two sentences: "Each traveller is an Adult (12 to 59), a Child (under 12, pays `CHILD_FARE_PERCENT`) or a Senior citizen (60 and over, pays `SENIOR_FARE_PERCENT` (A)), picked as counts. No names, ages or gender are asked; tickets carry the account name. Seatless trips (D-046) never show a seat, free travel included. The conductor may ask for proof of age on child and senior tickets." Line 129: the scanner shows the category, and the seat only on reserved trips.
  - docs/11 booking rows: "/book/[tripId] Step 1: boarding, destination, Adult, Child and Senior counts with the price of each; local trips continue to pay. /book/[tripId]/seats Step 2 on reserved trips: exactly one seat per traveller. /book/[tripId]/review: categories, seats on reserved trips." Remove the details step.
- **Phase 3, built 2026-10-16 (profile, verify, account):**
  - API: `MeDto` gains `emailVerified`, `phoneVerified`, `profileComplete`, `missing`, `notificationPrefs`; `PATCH /me` saves the name, language and email preferences; `POST /me/contact/otp/request` and `/verify` add or change the email or phone (codes bound to the account, `CONTACT_IN_USE` when another account owns it); `GET /auth/sessions`, `POST /auth/sessions/revoke-others`; `GET, POST, DELETE /me/saved-routes` (10 per citizen). Migration `20261019000000_profile_contact`. Without an SMS provider a phone is stored unverified with no code, and a phone does not block `profileComplete` (docs/18 G14). Tests: `profile-contact.test.ts` (24) and `me.service.test.ts` (6).
  - Web: `/welcome` (name, email, phone steps) opens for a citizen with an incomplete profile after login (`login-form.tsx`) and from `ProfileGate` in the citizen layout; staff accounts are never sent there. Account page: verified chips with add and change, email notification switches, saved routes, signed in devices with "Sign out other devices", and a travel hub (upcoming tickets, active passes, track a bus). Seeded demo citizens have a verified phone; the E2E `login()` helper completes `/welcome` for new accounts. Spec `d048-profile.spec.ts`.
- **Phase 4, built 2026-10-16 (map first home):** the map fills the first screen (`--spacing-home-map` 64svh), Pickup and Drop and "Use my location" float on it, and the From, To, date and Search sheet overlaps its lower edge. Saved routes show as chips in the sheet with a Save or Remove button for the pair now chosen (`saved-routes.tsx`). Spec `d048-home.spec.ts`.
- **Phase 5, built 2026-10-16:** the travel hub tiles on the account page (see Phase 3).
- **Phase 6, built 2026-10-16 (field safety, first slice):**
  - SOS: new `IncidentType` value `SOS` (migration `20261020000000_incident_sos`). The driver picks the SOS tile on the report screen; the conductor has an SOS button on the home screen with a confirm step (`POST /conductor/sos`, 5 per 10 min). The server fills trip, bus and location and forces `CRITICAL`, so ops and the command center see it like any incident (label `driverApp.report.types.SOS`).
  - Delay minutes: `DriverIncidentInput.delayMinutes` (1 to 240, only on a DELAY report) sets `trips.delayMinutes` now, publishes the trip status and runs the delay notifications. **Decision taken without the owner:** the GPS delay in `tracking.service.ts` still rewrites the delay when it differs by 2 minutes or more on the next ping, so a typed delay is a first estimate that GPS corrects. Say so if a manual delay should win instead.
  - Tests: three cases in `apps/api/test/tracking.test.ts`; spec `v4-sos.spec.ts`.
- **Kurnool spots, built 2026-10-16:** 43 more stops (parks, libraries, museums, stadiums, police and post offices, colleges and schools) on four new city lines `KSA-01` to `KSD-01` (every 30 min, 05:00 to 23:00). Positions are OpenStreetMap data fetched through Nominatim (Overpass was down). Telugu names are best effort transliterations and need a native review.
- **Still not built (owner input needed):** break button, alerts to the crew, conductor end of trip report, GPS with scans, richer manifest. The log only lists them as defaults and none has rules to build from.
- **Questions for the owner:** (1) Should same hour classes leave at different minutes (for example :00, :20, :40) instead of together? (2) Is the 50 percent senior discount right? (3) Without an SMS provider, should phone stay required for email sign ups? (4) Account deletion: wanted, and what is kept? (5) Which category goes on a Stree Shakti free ticket?
- **Status:** Phase 1 built and tested locally. Proposed for the docs; needs Dev A review of the doc text.

## Parked (ideas outside the 20 day scope)

| Idea | Raised by | Plan sec |
| --- | --- | --- |
| Offline scanning pack and batch validation (ADR 003) | Day 16 stretch | 77 |

### D-049: Four buses of each class every hour, Kurnool Local A to I, demo staff sign in (2026-10-16)

- Owner request for the government demo. Every intercity route runs four Express, four Ultra Deluxe (super express) and four Super Luxury buses every hour from 05:00 to 22:55, plus the route's AC bus hourly; routes up to 130 km keep Pallevelugu every 30 min. Kurnool city lines are named Kurnool Local A to I (codes unchanged).
- New web env `NEXT_PUBLIC_DEMO_ACCOUNTS` (default 0): when 1, the staff portal links on the sign in page show and fill in the seeded staff emails. Only for demo deployments that also run the API with `OTP_DEV_ECHO=1`. docs/15 needs this row (Dev B to agree).
- Supersedes the hourly mix in D-048. Needs Dev B review.
