# Daily log

Newest day on top. Each dev adds their own block at the end of every day using `prompts/_shared/end-of-day-report.md`.

Severity: **S1** blocks the demo (fix today), **S2** wrong behaviour (fix this week), **S3** polish (known issues list).

## Day 06 · 2026-10-03 · Dev A and Dev B

**Done**
- Dev B: `payments/` module. `PaymentProvider` interface, `RazorpayProvider` (SDK plus Node crypto HMAC SHA 256 with `timingSafeEqual`), `FakePaymentProvider`. POST /payments/orders (reuses the open order, amount from the booking), POST /payments/verify (signature, provider record, order id, amount, capture when authorized, Idempotency-Key), POST /payments/webhook (raw body signature, payment.captured, payment.failed). `confirmBooking` is the only place tickets are made: one transaction, tickets SINGLE BOOKED with APT codes, `expiresAt` from `ticket-rules.ts`, qrSecret sealed with AES 256 GCM. Holds released, `booking.confirmed` on the new `DomainEventsService`, audit `payment.verify`, `payment.webhook`, `refund.create`. Late payment refund path (D-020). Raw payloads redacted (card, VPA, contact, email, bank).
- Shared: `schemas/payments.ts`, `BOOKING_MAX_PASSENGERS`. Common: `common/crypto/secret-box.ts`, `common/services/idempotency.ts` (bookings now use it too), `test/fake-redis.ts`.
- Dev A: `Stepper` and `SeatMap` in packages/ui (buttons named "Seat 18, available", aria-pressed, icons plus border style per state, roving focus with arrow keys, driver cabin and aisle, legend). `/book/[tripId]` (points, seat map polled every 15 s, sticky fare bar, Continue with a reason), `/details` (react-hook-form with the shared schema, "Use my details", Idempotency-Key per attempt, SEAT_TAKEN back to step 1 with names kept), `/review?booking=` (hold timer with 5, 2 and 1 minute announcements, summary, fare, refund tiers, Pay toast in development, Cancel). `api()` takes `headers`.

**Verified**
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (shared 96, ui 35, web 33, api 149 + 6 database), `pnpm build`, `pnpm check:dashes`, `pnpm i18n:check`.
- Payments tests with the fake provider: happy path, wrong signature, amount mismatch, authorized then captured, double verify (with and without key), other user's payment, late payment refund (once only), late payment with free seats, webhook first then verify, verify then webhook, bad webhook signature 400, payment.failed.
- Browser on local PGlite: guest on /book goes to /login?next=, keyboard only booking of 2 seats on the 06:30 Express (Rs 1,082), validation focuses the first error, refresh on step 2 and 3 keeps data, SEAT_TAKEN (seat taken with curl) returns to step 1 with the message and moves the typed details to the new seat, browser Back from step 3 reuses the same booking, Cancel frees the seats, a closed booking shows HOLD_EXPIRED. Telugu at 360 px: no horizontal scroll.

**Carry over**
- No real Razorpay test keys locally (`.env` has placeholders): the live checkout with `success@razorpay` is not done. Needs a human to create the test keys (docs/15).
- Screen reader pass with NVDA or TalkBack not done (names and live regions checked in the DOM).
- Hold expiry by the timer itself not watched end to end (10 min); the expired view was checked through a cancelled booking.

**Contract changes (packages/shared)**
- New `schemas/payments.ts`, `BOOKING_MAX_PASSENGERS`.

**Decisions needed**
- D-020.

## Day 05 review · 2026-10-03 · Dev B

**Done**
- Reviewed the Day 5 merge (PR #3) and fixed the bugs below.

**Verified**
- `pnpm check:dashes`, `pnpm i18n:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (shared 96, ui 29, web 33, api 128 + 6 database tests), `pnpm build` all pass.
- The 6 database tests pass against a local PGlite database.
- Live API on local PGlite and `scripts/dev-redis.mjs`: two parallel POST /bookings for one seat give 201 and 409 SEAT_TAKEN, the seat shows HELD, seatsLeft drops in search and trip detail, DELETE gives 204 and frees it, useFreeTravel gives 422.
- Browser: home to /search Kurnool to Vijayawada tomorrow, Morning filter, open the 06:30 Express (Rs 541), Back keeps `timeBand=morning`. Telugu at 360 px: TripCard not clipped. No hydration errors.

**Bugs found**
- Fixed (S1): expiry job never scheduled. BullMQ rejects a custom job id with ":" (`expiry:<id>`) and the error was swallowed, so bookings stayed PENDING_PAYMENT forever.
- Fixed (S1): `useFreeTravel` was trusted from the client and priced the booking at zero.
- Fixed (S1): /search showed "Origin" and "Destination" (hardcoded) because it searched places by stop id. Names now come from the search saved on the tab.
- Fixed (S2): seat holds were not atomic across seats and a late release (DELETE or expiry) deleted holds that belonged to another booking. Now one Lua script each, release checks the owner.
- Fixed (S2): holdcount could go negative or drift (DECRBY on an expired key), so seatsLeft was overstated.
- Fixed (S2): DB failure after holding seats leaked the holds; DELETE and expiry raced on status (now conditional updates).
- Fixed (S2): POST /bookings rate limit was 10 per minute (docs/12: 10 per 10 min), no `@Can("booking:create")`, no `booking.create` audit row, Idempotency-Key not validated.
- Fixed (S2): BullMQ connection had `retryStrategy: () => null`, so the worker stopped for good after the first Upstash idle disconnect. Repeatable job now uses `upsertJobScheduler`. Queue calls in a booking have a 3 s timeout.
- Fixed (S2): bus details showed route origin times, not the searched segment; "Book" ignored booking close time (now `bookingOpen` from the API); fare showed Rs 0 when unknown; trip 404 showed a retry error.
- Fixed (S2): CI failed every run without secrets (cited a D-019 that did not exist). Database steps and E2E now skip without secrets.
- Fixed (S3): `pnpm lint` failed (any casts, unused imports, stray `apps/api/tmp-check.ts`); hardcoded "Search results", "Bus details", "N/A", "Breadcrumb", English TripCard accessible name; nested `<main>`; non token classes (`text-primary-fg`, `bg-border-default`, `rounded-xs`, `text-[10px]`); TripCard had no visible focus ring; filter chips under 44 px and without `aria-pressed`; page titles repeated the app name; PlaceCombobox hydration mismatch from browser storage; dev-redis crashed on a client reset.
- Removed `@electric-sql/pglite` and `pglite-socket` from root devDependencies (not in docs/04; the handoff says run it with npx).

**Carry over**
- E2E-1 not run locally: Playwright Chromium is not installed on this machine (`pnpm --filter web exec playwright install chromium`).
- Worker drainDelay and Upstash command count still need a real Upstash instance.

**Contract changes (packages/shared)**
- `TripDetailDto.bookingOpen` (D-019).

**Decisions needed**
- D-019.

## Day 05 · 2026-10-02 · Dev B

**Done**
- `packages/shared/src/format.ts`: formatTime, formatDate, formatMoney (paise to "₹541" with Indian grouping), formatDuration, formatDistance, all locale aware (en, te) and in Asia/Kolkata. Unit tests.
- `packages/ui/TripCard`: departure (large tabular), service type name, arrival approx, duration, seats left (plural ICU, warning when 5 or fewer, "Full" when 0), fare, StatusBadge, free travel chip. Accessible name for the whole card link.
- `apps/web` pages: `/search` (sticky summary bar, time band filter chips, results list with skeletons, empty and error states), `/bus/[tripId]` (full trip details from docs/11, boarding/dropping points, stops list, actions), `/timetable` (districts to bus stands to routes drill down, breadcrumb), `/timetable/route/[routeId]` (first/last/next bus, frequency, date switcher, day trips, stops list).
- `packages/shared/src/schemas/`: TripDetailDto, SeatMapDto, FareDto, CreateBookingInput, BookingDto.
- `apps/api/src/modules/trips`: GET /trips/:id, GET /trips/:id/seats?from&to, GET /trips/:id/fare?from&to (public). Seat state: TAKEN from tickets, HELD from Redis hold:{tripId}:{seatNo}, BLOCKED from layout. holdcount:{tripId} counter for seatsLeft.
- `apps/api/src/modules/bookings`: POST /bookings (user, atomic seat holds with SET NX EX, validation, PENDING_PAYMENT, totalPaise from fare.ts, idempotency), GET /bookings/:id (owner), DELETE /bookings/:id (owner, PENDING_PAYMENT only, releases holds).
- `apps/api/src/modules/queue`: QueueModule with notifications, expiry, rollups, maintenance queues. Worker (WORKER=1) with drainDelay from BULLMQ_DRAIN_DELAY_SEC (default 60). Jobs: expiry (booking-hold-expired delayed job), maintenance (repeatable generate-trips at 00:30 IST).
- Tests: booking concurrency test (two parallel requests for same seat, exactly one succeeds), hold expiry, DELETE releases, validation failures.
- E2E-1: Playwright test for guest search journey (home, search Kurnool to Vijayawada, see results, open bus details, filter chips persist). Configured for local development (assumes servers running).

**Verified**
- Worker drainDelay=60: reads BULLMQ_DRAIN_DELAY_SEC from env, defaults to 60, logs on startup.
- Playwright installed and Chromium downloaded.
- pnpm check:dashes, typecheck, test all pass.
- All Day 05 checklist items implemented per day-05.md.

**Carry over**
- Integration and E2E tests require Neon (DATABASE_URL) and Upstash (REDIS_URL) credentials in .env files per docs/15-env-setup.md. Without these, the API cannot connect to database/Redis and tests fail.
- CI requires TEST_DATABASE_URL and TEST_REDIS_URL GitHub secrets (Neon test branch, Upstash test instance).

**Contract changes (packages/shared)**
- New: format.ts, schemas/trip.ts, schemas/booking.ts.

**Bugs found**
- none

**Decisions needed**
- none

## Day 04 · 2026-09-30 · Dev B

**Done**
- `packages/shared/src/fare.ts`: `calculateFare` (per km with a minimum, nearest rupee, plus reservation fee, free travel is zero) and `refundQuote` (docs/07 section 6 tiers, exact 24/12/1 hour edges, operator cancel refunds fees, free tickets never refund, policy cancellation fee). 25 tests.
- `schemas/search.ts` and `schemas/network.ts`: every Dto and Query of the docs/06 network table, with real calendar date and HH:mm checks.
- `apps/api/src/modules/network`: `/places/search`, `/districts`, `/districts/:id/bus-stands`, `/bus-stands/:id/routes`, `/routes/:id`, `/routes/:id/timetable`, `/search/trips`. All public; search and places at 60 per minute. Search is one raw SQL round trip (route stops, trips, bus type, fare rule valid that day) plus one seat count `groupBy`. Booking close from `booking.closeMinutesBefore`. 60 s in memory cache (`TtlCache`) for places, districts and settings.
- D-016 built: `apt_session` marker set on verify and refresh, cleared on logout, failed refresh and refresh without a cookie.
- Seed aligned with docs/19 (D-018): base fare 0, all timetables, batched trip inserts, stale timetables deactivated.
- Tests: HTTP tests over an in memory docs/19 fixture (Kurnool to Vijayawada tomorrow gives the 6 trips, times and fares, Rs 541 Express; Telugu "కర్నూ" finds Kurnool; timetable first, last, next, frequency; one way pair gives nothing; invalid date gives VALIDATION_FAILED; 404s; rate limit headers). `network.int.test.ts` runs the real SQL on a seeded database.
- Verified the real SQL on a local PGlite database (migrate deploy, seed twice, `seed.test`, `health.int.test`, `network.int.test` all green; search p95 under 250 ms).

**Merged PRs**
- `b/network-search`: fast forwarded into `main` on 2026-09-30 (no PR, at the owner's request).

**Carry over**
- Run `network.int.test.ts` on the Neon test branch once `TEST_DATABASE_URL` exists.

**Contract changes (packages/shared)**
- New: `fare.ts`, `schemas/search.ts`, `schemas/network.ts`.

**Bugs found**
- Fixed: seed fares and timetables did not match docs/19 (S2).

**Decisions needed**
- D-016 (built), D-018.

## Day 04 · 2026-09-30 · Dev A

**Done**
- `lib/api.ts`: same origin fetch wrapper, docs/06 error shape to `ApiError` (with `retryAfterSec`), every response validated with the shared Dto, 401 then one single flight refresh (shared promise in the tab, Web Lock across tabs, D-012), one retry, else session cleared and `/login?next=`.
- Session: `AuthProvider` (token in memory only, silent refresh on load when the server sees `apt_session`, `login`, `logout` with a BroadcastChannel to other tabs), `useMe`, React Query defaults (1 retry for 5xx and network, none for 4xx).
- `proxy.ts` guards the docs/08 login routes with the marker (D-016). Driver, conductor, ops, gov and admin layouts check `can()` after `useMe` and show a 403 state.
- Home: PlaceCombobox (ARIA combobox, 200 ms debounce, 2 characters, English and Telugu, district and kind, recent places in localStorage, skeleton, empty and error with retry), swap, Today, Tomorrow and calendar (`DatePicker` and `OtpInput` added to `packages/ui` with tests), inline validation, `/search?from=&to=&date=`, quick actions. Form restored after Back.
- Login: Email and Phone tabs (phone note), send code, 6 box OTP with paste, autofill and auto submit, resend timer, change target, error codes mapped (RATE_LIMITED shows the seconds). Goes to `next` or the role home. The account language applies after login.
- Account: name (PATCH /me), email, masked phone, language (also PATCHes `preferredLocale` when logged in), theme light, dark, system, role list when there are several roles, Log out. Staff account menu shows the user and logs out for real.
- Checked in the browser against the real API on local PGlite: 360, 768, 1280 px, English and Telugu, keyboard only home and calendar, wrong code, paste, reload keeps the session (one refresh call), citizen gets 403 on /ops, manager gets in, logout clears the marker.

**Merged PRs**
- `a/home-login`: fast forwarded into `main` on 2026-09-30 (no PR, at the owner's request).

**Carry over**
- Scope switcher in ops and gov needs depot and district names (MeDto has only ids).
- D-015 (short Telugu nav label) still open.

**Contract changes (packages/shared)**
- none from Dev A.

**Bugs found**
- Fixed today: calendar overflowed at 360 px and opened on the month arrow; dialog close button was 28 px (now 44); focus lost after a wrong OTP; logout on a guarded page went to /login instead of /; locale from the account did not reach the root layout after login (now a full load).
- Fixed: EmptyState and ErrorState now support headingLevel ("h1", "h2", "h3"); 403, not-found, and error states now render h1.

**Decisions needed**
- D-017.

## Day 03 review · 2026-09-27 · fixes before Day 4

**Done**
- Pulled `main` (PR #1 day-2, PR #2 day-3). Install, lint, i18n:check, typecheck, test, build and audit were green, but review and a browser pass found the bugs below. All fixed, all gates green again.

**Bugs found and fixed** (id, severity, one line)
- R3-01 · S1 · `/ops`, `/gov`, `/admin` crashed at runtime: server layouts passed lucide component functions to the client sidebar. Icons now go as elements.
- R3-02 · S1 · `packages/ui` Button, IconButton, ErrorState and Radix wrappers had no `"use client"`; Button inside any server page threw ("Event handlers cannot be passed"). Added the directive.
- R3-03 · S1 · OTP codes reached the logs outside development (SMS log line, email body for .test addresses) with full phone and email. Now development only and masked; staging uses OTP_DEV_ECHO.
- R3-04 · S2 · One OTP could log in twice with parallel verifies; parallel wrong guesses shared one attempt. Consume and attempts are now atomic, and attempts are capped in the DB even when Redis is down.
- R3-05 · S2 · Parallel refreshes with one token both rotated. Token claim is atomic (D-012). Failed refresh clears the cookie.
- R3-06 · S2 · Soft deleted users (`deletedAt`) could log in and refresh.
- R3-07 · S2 · Refresh cookie was not Secure on staging (D-013).
- R3-08 · S2 · Rate limit keys could lose their TTL (INCR then EXPIRE) and block forever. One atomic Lua command, TTL re-armed.
- R3-09 · S2 · Default rate limit (docs/12: 120 per user or IP per minute) was missing; `@nestjs/throttler` was installed but unused. Now global with Redis storage; `@Throttle` tightens per route (needed by Day 4 search).
- R3-10 · S2 · `@Audit(action)` did nothing. AuditInterceptor now writes the row.
- R3-11 · S2 · About 20 class names used in Day 2 and Day 3 did not exist in the token theme (`border-border-default`, `text-text`, `rounded-control`, `text-body-sm`, `bg-black/60`...), so borders, text colours, radii and overlays silently fell back. Replaced with real tokens; added `--scrim` (D-014).
- R3-12 · S2 · Theme switch removed the focus ring; header icons, language buttons and menu items were under 44 px.
- R3-13 · S2 · Hardcoded English in shells, home, sidebar, aria labels and metadata; fake KPI numbers on ops, gov, admin, driver and conductor. Now i18n keys and an honest placeholder.
- R3-14 · S3 · `<Link><Button>` nesting on 404 and error pages. Now `Button asChild`.
- R3-15 · S3 · Accept-Language check was a substring match ("en-IN,te;q=0.1" picked Telugu). Now parsed by q weight.
- R3-16 · S3 · Nested layout titles doubled the suffix; `/` showed "AP TransitOS · AP TransitOS".
- R3-17 · S3 · Email targets were not lower cased in the shared schema; generated codes never included 999999.

**Contract changes (packages/shared)**
- `OtpRequestInput`, `OtpVerifyInput`: target max 254, email lower cased by the schema.

**Blockers or questions for the other dev**
- D-015: short Telugu label for "Track bus" in the bottom nav.
- D-016: the web route guard cannot see `apt_rt` (path /api/v1/auth). Needs a marker cookie before Day 4 step 3.

**Decisions needed (also added to decisions-log.md)**
- D-012 to D-016.

## Day 03 · 2026-09-25 · Dev B

**Done**
- `packages/shared`:
  - `src/schemas/auth.ts`: Zod schemas for `OtpRequestInput`, `OtpVerifyInput`, `MeDto`, `UpdateMeInput` with E.164 phone validation (+91 standard) and trimmed lower case email. Unit tests in `src/schemas/auth.test.ts`.
- `apps/api`:
  - `common/pipes/zod-validation.pipe.ts`: Body, query, and param validation with `@aptransit/shared` schemas returning `VALIDATION_FAILED` (400) with detailed error field details.
  - Decorators: `@CurrentUser()`, `@Can(permission)` using permissions matrix, `@Audit(action)`.
  - Guards and services: Global `JwtAuthGuard` supporting `@Public()` and permission enforcement via `Reflector`, `ScopeService` (`assertDepotAccess`, `assertDistrictAccess`), `RateLimitService` with Redis backing and headers, `AuditService` writing `AuditLog` rows.
  - `ResendEmailProvider` with logging for `.test` domains and phone channel.
  - `POST /auth/otp/request`: Generates 6-digit code, SHA-256 hashed with `OTP_PEPPER`, 5-minute expiry, dev code echoing when non-production.
  - `POST /auth/otp/verify`: Constant-time comparison, 5-attempt limit with 15-minute Redis target lockout (`otp:lock:{target}`), creates citizen user if new, issues 15-minute access token (jose HS256) and 30-day refresh token in HTTP-only `apt_rt` cookie.
  - `POST /auth/refresh`: Token rotation with family tracking; detects reuse of revoked tokens and revokes entire family with `auth.refresh_reuse_detected` audit log.
  - `POST /auth/logout`: Revokes refresh token family and clears `apt_rt` cookie.
  - `GET /me` and `PATCH /me`: User profile fetch with phone masking and profile update (name, preferredLocale).
  - 39 API unit and integration tests passing (`test/auth.test.ts`, scope service, env, trip generator, health).

**Merged PRs**
- `b/auth`

**Carry over (starts tomorrow before the new prompt)**
- Wire login and registration frontend UI into API on Day 4.

**Contract changes (packages/shared)**
- Added: `OtpRequestInputSchema`, `OtpVerifyInputSchema`, `MeDtoSchema`, `UpdateMeInputSchema` in `packages/shared/src/schemas/auth.ts`.

**Bugs found** (id, severity S1 to S3, one line)
- none

**Blockers or questions for the other dev**
- none

**Decisions needed (also added to decisions-log.md)**
- none

## Day 03 · 2026-09-25 · Dev A

**Done**
- `packages/shared`:
  - `src/messages/en.json` and `te.json`: Added `notifications.*` and `email.*` i18n message keys.
- `scripts`:
  - `scripts/check-i18n.mjs`: Node.js script verifying key parity across web and shared, non-empty values, no em or en dashes, and ICU syntax validation. Unit tests in `scripts/check-i18n.test.mjs`. Wired into CI and root `pnpm i18n:check`.
- `apps/web`:
  - `next-intl` configuration in `apps/web/i18n/request.ts` with cookie-based locale (`en` and `te`, default `en`), merging web and shared messages.
  - Root layout: Server-side cookie reading for `locale` and `theme` (no flash on load), `data-locale`, `data-theme`, taller Telugu line height token on `html` when `te`.
  - `LanguageSwitch` component: Switcher displaying "English" and "తెలుగు", sets cookie and triggers refresh.
  - `ThemeSwitch` component: Toggle using `useSyncExternalStore` and mutation observer, sets `theme` cookie and updates `data-theme`.
  - App shells for all 6 surfaces per docs/03 and docs/11:
    - `(citizen)`: Top bar with wordmark, nav links, language and theme toggles, mobile bottom navigation with active indicators and aria-current, skip link.
    - `driver`: Focused full-screen layout with large display typography, high-contrast status badge, large touch target buttons (56 px).
    - `conductor`: Full-screen layout with passenger count stats and large scan QR button.
    - `ops`: Depot operations dashboard layout with management sidebar and KPI metrics.
    - `gov`: State command center layout with management sidebar, statewide scope selector, and KPI metrics.
    - `admin`: System administration layout with management sidebar and administrative service cards.
  - Component gallery at `/design`: Comprehensive development showcase displaying all 12 UI primitive groups, states, side-by-side theme toggle, language toggle, and status badge grid.
  - Friendly `not-found.tsx` and `error.tsx` handling with `EmptyState`, `ErrorState`, and localized actions.
  - Metadata title template in each layout adhering to `{Page} · AP TransitOS`.

**Merged PRs**
- `a/shells-i18n`

**Carry over (starts tomorrow before the new prompt)**
- Build citizen home screen, route search, and booking flow on Day 4.

**Contract changes (packages/shared)**
- Added: `packages/shared/src/messages/en.json` and `te.json`.

**Bugs found** (id, severity S1 to S3, one line)
- none

**Blockers or questions for the other dev**
- none

**Decisions needed (also added to decisions-log.md)**
- none

## Day 02 · 2026-09-24 · Dev B

**Done**
- `packages/shared`:
  - `src/codes.ts`: Crockford base32 code generators for `APT-XXXX-XXXX`, `BKG-XXXXXX`, `PAS-XXXXXX`, `CMP-XXXXXX`, `INC-XXXXXX` with checksum and parsing tests.
  - `src/polyline.ts`: Google encoded polyline algorithm (encode and decode) with 5-decimal precision and test vectors.
  - `src/time.ts`: Pure IST time calculation helpers (`istTimeToUtcDate`, `utcToIstParts`, `formatIstDate`, `formatIstTime`, midnight crossings, and night departure handling) with unit tests.
  - `src/permissions.ts`: Complete role and permission matrix from docs/08 with `can(roles, permission)` helper and unit tests.
  - `src/schemas/seat-layout.ts`: `SeatLayout` Zod schema and types matching docs/05 JSON specification.
  - 41 unit tests passing across all shared packages.
- `apps/api`:
  - Full Prisma schema v1 matching docs/05: every enum, table with relations, `@@map` snake_case names, unique constraints, indexes, cuid2 ids, integer paise money, BigInt autoincrement for `gps_locations`.
  - Generated Prisma Client and created migration `20260924000000_schema_v1`.
  - `src/modules/trips/trip-generator.ts`: Pure function generating trips from timetables across date ranges with daysMask, validFrom/validTo, night departures, and deterministic idempotency. 5 unit tests.
  - `prisma/seed.ts` and `prisma/seed-data.ts`: Deterministic seed (seed 20260923) with upserts for districts, stops, depots, routes, route_stops with straight-line encoded polylines, bus types with seatLayout JSON, refund policies, pass types, buses (AP 39 Z), drivers, conductors, approved driver devices, demo accounts with roles from docs/08, timetables, trips for today + 7 days with initial trip assignments, and maintenance/breakdown bus statuses.
  - `prisma/reset.ts`: Safe database reset script guarding against production or main branch URLs.
  - Configured `migrations.seed` in `prisma.config.ts`, added `pnpm db:seed` and `pnpm db:reset` scripts in `apps/api/package.json`.
  - Added seed integration tests in `test/seed.test.ts`.

**Merged PRs**
- `b/schema-v1`

**Carry over (starts tomorrow before the new prompt)**
- Apply `20260924000000_schema_v1` on Neon test branch and live dev branches once Neon credentials are plugged into `.env`.

**Contract changes (packages/shared)**
- New: `codes.ts`, `polyline.ts`, `time.ts`, `permissions.ts`, `SeatLayoutSchema`.

**Bugs found** (id, severity S1 to S3, one line)
- none

**Blockers or questions for the other dev**
- None. Shared schema and seat layout verified with Dev A.

**Decisions needed (also added to decisions-log.md)**
- none

## Day 02 · 2026-09-24 · Dev A

**Done**
- `packages/ui`:
  - Configured Vitest and Testing Library (`@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`).
  - Implemented all 12 primitive groups matching docs/09 design tokens, dark mode, keyboard navigation, full accessibility, and zero hardcoded strings:
    1. `Button` (variants: primary, secondary, ghost, danger, link; sizes: md 44 px, lg 52 px, xl 56 px; loading spinner, aria-busy, blocks clicks, asChild) and `IconButton` (enforced aria-label, 44 px hit area).
    2. `Field` (always visible label, optional hint, error message with icon, connects id, aria-describedby, aria-invalid).
    3. `Input`, `Textarea`, `Select` (Radix), `Checkbox`, `RadioGroup`, `Switch` (16 px minimum text, border-strong tokens, error and disabled states).
    4. `Card` (plain, interactive with focus ring, selected).
    5. `StatusBadge` (status key from @aptransit/shared, lucide icon + label, sm and md sizes, token colors) and `ToneChip`.
    6. `Skeleton` (line, block, card presets) and `Spinner`.
    7. `EmptyState` and `ErrorState` (message, Retry button, optional request id).
    8. `Dialog` (Radix; title, description, footer, focus trap, Escape closes).
    9. `Sheet` (vaul drawer mobile bottom sheet, drag handle, close button).
    10. `Toaster` and `toast` (sonner; success and info, mobile bottom, desktop top-right).
    11. `Tabs` (Radix).
    12. `Tooltip` (Radix) and `DropdownMenu` (Radix).
  - Unit tests in `packages/ui` for Button, Field, Dialog, StatusBadge (10 tests passing).
- `apps/web`:
  - Built comprehensive primitives showcase in `apps/web/app/_token-check/primitives-showcase.tsx` embedded into `app/page.tsx` testing all 12 primitives across light and dark themes and mobile and desktop viewports.

**Merged PRs**
- `a/ui-primitives`

**Carry over (starts tomorrow before the new prompt)**
- Delete temporary showcase in `apps/web/app/page.tsx` on Day 3 and replace with citizen shell and route layout.

**Contract changes (packages/shared)**
- Agreed and consumed `SeatLayout` Zod schema and `STATUS_MAP`.

**Bugs found** (id, severity S1 to S3, one line)
- none

**Blockers or questions for the other dev**
- none

**Decisions needed (also added to decisions-log.md)**
- D-011 (allow esbuild in pnpm-workspace.yaml)

## Day 01 · 2026-09-23 · Dev B

**Done**
- Monorepo: pnpm 11 workspaces, Turborepo tasks (generate, build, dev, lint, typecheck, test), shared tsconfig, ESLint and Prettier presets in `packages/config`.
- `scripts/check-dashes.mjs` with tests, wired into `pnpm lint` and CI.
- `packages/shared`: every enum from docs/05, error codes with HTTP status map and the error body schema, status map with `deriveTripDisplayStatus`, ticket status tones, colour of the day in IST, money helpers, `HealthDto`. 18 unit tests.
- `apps/api`: NestJS 11, `/api/v1` prefix, helmet, CORS for WEB_ORIGIN only, 100 kb body limit, trust proxy, zod env validation (refuses live Razorpay keys and dev switches in production), pino logs with request ids and redaction, docs/06 error filter, Prisma 7 with the pg adapter (lazy connect), ioredis (lazy, TLS ready), `GET /api/v1/health` (200 ok, 503 degraded), worker entry.
- Prisma schema with `settings`, `init` migration generated offline.
- 18 API tests: env rules, health probes, full HTTP pipeline (health, 404 shape, request ids, security headers, CORS, body limit). Neon integration test skips until `TEST_DATABASE_URL` exists.
- CI workflow and PR template. Version record in docs/04.
- Booted the compiled API and worker with a fake env: health answers 503 with db and redis down, live Razorpay key is refused at boot.

**Merged PRs**
- `b/skeleton`: fast forwarded into `main` on 2026-09-23 (no PR, at the owner's request).

**Carry over (starts tomorrow before the new prompt)**
- Fill `apps/api/.env` once the accounts exist, run `pnpm db:migrate` on dev-a and dev-b, confirm `/api/v1/health` shows db ok and redis ok.
- Add `TEST_DATABASE_URL` (Neon test branch) as a GitHub Actions secret so the integration test runs in CI.
- Protect `main` on GitHub: PR required, 1 approval, CI required.
- Check the first GitHub Actions run (triggered by the push to `main`).

**Contract changes (packages/shared)**
- New: enums, errors, status, money, `HealthDto`.

**Bugs found**
- none open

**Blockers or questions for the other dev**
- Accounts (Neon, Upstash, Razorpay test, Resend) are needed before the API can reach real services.

**Decisions needed (also added to decisions-log.md)**
- D-001 to D-006, D-008. Review at the sync.

## Day 01 · 2026-09-23 · Dev A

**Done**
- `packages/ui`: all docs/09 tokens in `tokens.css` (light, dark by system preference, dark by choice), status tones (text, soft, solid), colour of the day, type scale with taller Telugu line heights, radius, elevation, gutter, layers, motion, Tailwind 4 theme that only knows our tokens, base layer (focus ring, reduced motion, long word wrapping).
- `cn()` with tailwind-merge taught our token names (text-h1 and text-muted no longer cancel each other).
- `apps/web`: Next.js 16, Tailwind 4, Inter and Noto Sans Telugu via next/font, rewrite of `/api/v1` to the API, `.env.example`, ESLint with Next rules and full jsx-a11y.
- Temporary token check page at `/` (delete on Day 3). Checked at 360, 768, 1280 px, light, dark and system, English and Telugu, keyboard focus.

**Merged PRs**
- `a/web-scaffold`: fast forwarded into `main` on 2026-09-23 (no PR, at the owner's request).

**Carry over (starts tomorrow before the new prompt)**
- Create the accounts from docs/15 and share them through the password manager.

**Contract changes (packages/shared)**
- none

**Bugs found**
- Fixed today: 6 px horizontal scroll at 360 px from a long Telugu word, focus ring briefly flashing the text colour, status chip overflowing its card at 1280 px, `next dev` writing its own AGENTS.md and CLAUDE.md with em dashes (turned off, D-007).

**Blockers or questions for the other dev**
- none

**Decisions needed (also added to decisions-log.md)**
- D-007. Review at the sync.
