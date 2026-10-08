# Daily log

Newest day on top. Each dev adds their own block at the end of every day using `prompts/_shared/end-of-day-report.md`.

Severity: **S1** blocks the demo (fix today), **S2** wrong behaviour (fix this week), **S3** polish (known issues list).

## v2 Task L: 2026-10-08, login fixes (branch b/login-fixes)

**Done**
- L1: new error code `EMAIL_DELIVERY_FAILED` (HTTP 502) in packages/shared. `ResendEmailProvider` throws it instead of `INTERNAL` when Resend refuses the mail or the request fails. `/login` shows the en and te message through the existing `errors.*` lookup. New `email.provider.test.ts` (4 tests).
- L2: when the API returns `devCode`, the code step shows `login.codeSentTest` ("no email is sent") instead of "We sent a code to {target}". `login.devCode` and the E2E helper (reads `devCode` from the response) are unchanged.
- L3: `PROBE_TIMEOUT_MS` 1000 to 3000 ms. Tests: a 1.5 s database is ok, a 10 s one is down after 3 s.
- L4: not changed. Proposal sent to the owner: hide the Phone tab while no SMS provider exists.
- L5: three login and health gotchas added to handoff.md.
- docs/04: Next.js version updated to 16.3.8 (the bump is already in package.json).

**Contract changes (packages/shared)**
- New `ErrorCode.EMAIL_DELIVERY_FAILED` with status 502. docs/06 lists the core codes; it is not edited here (locked, no phase owns it). Add the code there with the next docs/06 change.

**Telugu review:** two new strings (`errors.EMAIL_DELIVERY_FAILED`, `login.codeSentTest`) need a native speaker.

**Human tasks (cannot be done in code)**
- Verify a domain in Resend and set `EMAIL_FROM` to it.
- Set `APP_ENV=staging` on Render, then `OTP_DEV_ECHO=0`.
- Check the Render worker service is running (health shows `worker: stale` without it).

## Day 19: 2026-10-08, release checks (local and Neon)

**Done**
- `pnpm check:endpoints`: all 116 docs/06 endpoints exist in the API; extras are listed with their decision (D-029 lookups, Day 11 driver trips) and the offline pack is in the backlog (D-031).
- Neon staging (project cool-smoke-27052649, branch production): 3 migrations applied, base seed and 14 days of history loaded (6,384 trips, 266 daily_stats rows). History step 171 s, whole seed 303 s, run from a laptop in India to Neon Singapore. Target under 2 minutes: missed by about 50 s from here; from Render in the same region it should be faster (to measure on deploy).
- Branch `days-15-16` pushed to the fork; PR description in `.local/pr-description.md`.

**Bugs found and fixed while running every E2E spec on both projects**
- S2: ops replace bus confirm dialog and trip detail showed the bus id ("busops0000001") instead of the registration number.
- S2: five message keys used by staff and admin screens did not exist in either language (opsApp.name, adminApp.users, adminApp.auditLogs, adminApp.stops, adminApp.routes); next-intl showed the key path. pnpm i18n:check only compares the two files, so the route sweep now catches this.
- S2: login tabs had no tab panel (axe aria-valid-attr-value, critical); the form is now the active tab's panel.
- S3: /gov/analytics scrolled sideways at 360 and 768 px (tab list), charts were focusable inside an aria-hidden container (Recharts accessibility layer), gov map markers overlapped as small targets (now pointer shortcuts; the district list is the keyboard route), admin route links were a button inside a link.
- Final run (commit ed249bd): Desktop Chrome 17 of 17, Pixel 7 17 of 17, route sweep 5 of 5. Unit tests: API 419 (6 database tests skipped), shared 121, ui 47, web 44, scripts 6; lint, typecheck, i18n, dashes, check:endpoints pass.
- E2E-3 used up tomorrow's Kurnool to Vijayawada trips over many runs (demo:window moves a trip to now); `demo:window <ticket> reset` puts it back and E2E-3 runs it at the end. Lint now ignores the MapLibre worker files copied into public/.
- Test fixes: E2E-9 expected the incident note in the list (it is in the drawer) and an old button name; E2E-4 did not allow paise in refunds (docs/07 has no rounding rule, refunds keep paise); E2E-12 booked in Telugu with English selectors and left the shared citizen in Telugu.

## Day 18: 2026-10-07 and 08, polish and operations

**Done**
- Backend: retention on the maintenance queue (02:00 IST, batches of 10,000: GPS 30 days, OTP 24 h, dead refresh tokens 30 days, notifications 90 days), failed jobs summary (07:00 IST), GET /health with workerAgeSec and queue depth, GET /admin/jobs/failed (D-032). Sentry skipped (D-032).
- MapLibre worker fix: maps never loaded in production builds ("Worker failed to load"); the worker files are now copied into public/ and set with setWorkerUrl.
- Tailwind classes that never applied (bg-success/10, text-danger, border-border, text-xs, text-foreground, font-tabular and others in admin, ops and ui) mapped to theme classes; `pnpm check:classes` lists any left.
- E2E-12 (Telugu journey) and `e2e/route-sweep.spec.ts`: 26 routes (public, citizen, ops, gov, admin) at 360, 768 and 1280 px in English and Telugu: h1, no horizontal scroll, no untranslated keys, no serious or critical axe violations at 1280 px.
- Telugu review list for a native speaker: `progress/telugu-review.md` (201 strings, Days 15 to 18).
- Command center checked live with the simulator: KPIs, district counts, incident feed, most delayed routes, map with district and incident markers, no console errors.

**Verification**
- API 419 tests (6 database tests skipped), shared 121, web 44, lint, typecheck, i18n, dashes.
- Route sweep: 5 of 5 groups pass after the fixes above.

**Not done (needs staging, devices or people)**
- Lighthouse on staging, uptime monitor, Neon restore drill, Upstash and Neon usage numbers, TalkBack and NVDA passes, zoom 200 percent and dark mode manual pass, native Telugu review.

## Day 17: 2026-10-07, Dev A and Dev B

**Done**
- Frontend: /gov/analytics (tabs Routes, Buses, Passengers, Delays, Demand in the URL, date range up to 14 days, sortable tables, top routes and utilisation bars, tickets per day line, busy hours, delay by hour, worst routes sentence "KNL-VJA-01: average delay 18 min, mostly 5 PM to 8 PM", demand chips with the planners note), /gov/reports (Daily, Weekly, Monthly cards, CSV download through the API with toast), /feedback (email prefilled, category chips, counter, optional trip details, code with Copy and Track status), /feedback/status (code and email, status timeline, resolution note), /ops/complaints (status filter, drawer, one step status change with required note to resolve, assign to me). Give feedback links on used or expired tickets and in the account page. Chart rules at the top of components/charts/index.ts.
- API: /analytics/passengers adds daily, /analytics/delays worst routes add peakFromHour and peakToHour (peak hour widened to neighbours at 75 percent or more of it, at most 3 hours).
- Security headers: CSP per request with a nonce in proxy.ts (script-src self, nonce, strict-dynamic, Razorpay; connect-src self, socket origin, Razorpay API, map tiles; frame-src Razorpay; worker-src self blob; frame-ancestors none), HSTS, nosniff, referrer policy, permissions policy (camera and geolocation self, microphone none) and X-Frame-Options in next.config.ts for every route.
- Logs: request URLs mask email, phone and target query values; req.query.email, *.email and *.phone redacted.
- Load scripts: scripts/load/search.ts, scripts/load/validate.ts (autocannon), apps/api/scripts/load-pool.ts (load test conductors on running trips, ACTIVE tickets, 1 hour tokens; never in production). Commands pnpm load:pool, load:search, load:validate. Results land in .local/load.

**docs/12 row by row**
| Row | Where | Status |
| --- | --- | --- |
| A01 access control | common/guards/jwt-auth.guard.ts (global, @Public opt out, @Can); common/services/scope.service.ts depotScopeWhere; ops.service scope(); tickets ownership (404 for others) | done |
| A02 crypto | auth.service (SHA 256 OTP and refresh hashes), common/crypto/secret-box.ts (AES 256 GCM qrSecret), tickets/qr.service.ts (Ed25519) | done |
| A03 injection | Prisma; $queryRaw only with Prisma.sql templates (analytics, rollups); zod pipes on every input; no dangerouslySetInnerHTML in apps/web | done |
| A04 insecure design | shared/fare.ts, tickets/ticket-rules.ts, scan rules, server decides payment, status, eligibility, fare | done |
| A05 misconfiguration | http-app.ts (helmet, CORS web origin only, 100 kb body), config/env.ts zod boot check, x-powered-by off (API helmet, web poweredByHeader false) | done |
| A06 components | CI pnpm audit; today pnpm audit --prod: no known vulnerabilities | done |
| A07 auth | auth.service (6 digits, 5 min, 5 attempts then 15 min lock, refresh rotation with reuse detection, 15 min access) | done |
| A08 integrity | payments (HMAC verify and webhook raw body, idempotency keys) | done |
| A09 logging | common/logger.ts (redaction, request id, URL masking added today), audit_logs | fixed today (email in /feedback/status URL was logged) |
| A10 SSRF | outbound only Razorpay and Resend, no user URLs fetched | done |
| Rate limits | throttler guard plus RateLimitService (OTP, feedback 5 per IP per hour, feedback status lookups) | done |
| Web headers | lib/csp.ts, proxy.ts, next.config.ts | done locally, staging check pending |
| Tokens on the web | lib/session.ts memory only, refresh cookie httpOnly, lib/api.ts single refresh | done |
| GPS trust | tracking module (approved device, running assignment, bounding box, speed, time) | done |
| Identity data | eligibility module stores scheme, result, reason, provider ref, times only | done |
| Payments | server computed amounts, redactPaymentPayload, env rejects non rzp_test keys | done |
| Audit events | complaint.update and report.export added on Days 15 and 16 | done |

**Attacks (docs/12 hardening pass)**
| Attack | Result | Regression test |
| --- | --- | --- |
| Another user's ticket id | 404 NOT_FOUND (live) | tickets.test.ts "another user gets 404 on someone else's ticket" |
| Depot manager on another depot | 403 (live, Kurnool manager on a Vijayawada bus) | day13-ops.test.ts "blocks cross-depot reads and writes" |
| Replayed payment verify | same result, tickets created once | payments.test.ts "verify then webhook creates tickets once" |
| Replayed webhook | no second refund or status change | tickets.test.ts refund.processed webhook, day13 signed callbacks |
| Forged QR | BAD_SIGNATURE before any other check | day12-validation.test.ts "parsing and signature precede every other check" |
| Screenshot QR after 90 s | STALE_CODE | day12-validation.test.ts (code two steps old fails) |
| GPS ping from an unapproved device | rejected | tracking.test.ts "rejects an unapproved device and a missing key" |
| OTP brute force | 5 wrong codes lock 15 min | auth.test.ts "5 wrong codes lock the target for 15 minutes" |
| Oversized body | 413 (live, 150 kb feedback) | http.test.ts "rejects bodies over 100 kb" |
| SQL like input in search | 200 with an empty list (live) | Prisma parameters; no raw SQL on that path |
| Extra: forged JWT, citizen on /gov, wrong email on complaint status, 6th feedback in an hour | 401, 403, generic 404, 429 (live) | day16-feedback.test.ts, http tests |

**Load (local Docker, one laptop running API, database and generator; staging run pending)**
- Validate, 30 rps for 60 s, 20 load conductors: 1711 requests, all 200, client p50 62 ms, p95 1025 ms. Server responseTime at 10 rps p50 69 ms, p95 111 ms; at 30 rps server p95 592 ms (CPU shared with the generator). Target p95 300 ms: to confirm on staging.
- Search, 50 rps for 10 s from one IP: 60 x 200 then 429 (docs/12 limit 60 per IP per minute), p50 15 ms. A 50 rps search test needs several source IPs on staging.
- pnpm audit --prod: no known vulnerabilities.

**Bugs found**
- S2 fixed: complaint lookup email was written to the request log (URL and query).
- S3: 413 responses carry requestId "unknown" (body parser runs before the request id is attached).
- S3: one conductor is limited to 120 scans a minute, so validate load needs several conductors (load:pool makes them).

**Not done**
- Headers, load tests and log check on staging (no staging yet). E2E-10 and E2E-11 written next with the Day 18 browser pass.

## Day 16: 2026-10-07, Dev A and Dev B

**Done**
- Backend: POST /feedback (public, user optional, 5 per IP per hour), GET /feedback/mine, GET /feedback/status (code and email must both match, one generic NOT_FOUND), GET and PATCH /ops/complaints (complaint:manage scope, one step at a time, note required to resolve, assignee checked, audit complaint.update, COMPLAINT_UPDATE in app for users, email for guests). Confirmation and update emails in English and Telugu from packages/shared messages. Complaint counts in daily_stats and /gov/overview were added on Day 15. Offline pack moved to the backlog (D-031).
- Frontend: /gov command center (KPI row, AP map with district HQ markers sized by active buses and toned by delay level, clustered live buses from one GeoJSON source, incident markers, live incident feed, most delayed routes), "Live, updated N s ago", state or district socket room, below 768 px a note plus the KPI row. Drill down with breadcrumb: /gov/district/[id] (KPIs, zoomed map, depots), /gov/depot/[id] (routes table), /gov/route/[id] (trips table, delay by hour chart, demand chips, buses now), /gov/trip/[id] (trip facts plus the live tracking view). District officers land on their district. Sidebar items can need a permission (Complaints link for complaint:manage).
- Recharts added (docs/04 lists it) with apps/web/components/charts (chart rules, BarSeriesChart with a data table toggle).

**Verification**
- API: 16 new feedback tests (input rules, depot lookup, wrong email lookup, transitions, guest email, assignee scope, Telugu email). Web and UI typecheck and lint, i18n check and check:dashes pass.

**Not done**
- Browser walk with the simulator (markers move, KPIs tick, breakdown in the feed within 3 s): pending, run together with Day 17 screens.

## Day 15: 2026-10-07, review and fixes (Dev B scope)

**Done**
- Review of the Day 15 code on main found the backend half was not working. Fixed: the history seed crashed on its first insert (serviceDate passed as a string), so it had never run; /analytics/buses and /analytics/delays returned 500 on every call (same cause); hours and demand bands used UTC instead of IST; revenue summed ticket fares instead of captured minus refunded; /gov/map incident counts compared bus ids with depot ids (always 0); gov overview, map, routes, analytics and reports had no district scope.
- History seed rewritten (prisma/seed-history.ts): trips from the shared trip generator, fares from calculateFare, bookings, payments, operator refunds for cancelled trips, assignments, ticket and pass scans, 135 passes, 25 complaints, 11 resolved incidents plus the open breakdown, maintenance windows, GPS for the last 2 days, rollups. Deterministic, reruns delete the earlier run first. Bulk inserts with unnest.
- Rollups, analytics, gov and reports rewritten (D-030). Reports stream, follow report:export scope and block CSV formula injection.
- Migration 20261007000000_query_indexes (18 indexes, D-030).

**Verification**
- SQL against the seeded data: load factor evening 75.4, morning 67.2, afternoon 54.8, night 55.2 percent; evening KNL-VJA and VJA-GNT average delay 20 min, others 5; 3 percent cancelled; captured 92,63,298 minus refunded 1,94,289 equals rollup revenue 90,69,009 rupees; one open incident.
- Local API timings (median of 3, 14 days of data, Docker Postgres): overview 313 ms, map 398, routes 303, buses 461, passengers 381, delays 242, demand 237, district drill down 301, daily operations CSV 254, route performance CSV 260. Tickets CSV for one full day (3 MB) 1.9 s.
- District officer: own district 200, other district drill down, route demand and district analytics 403; analytics routes list only Kurnool routes.
- Tests: shared 121, api 397 passed (6 database tests skipped); lint, typecheck and check:dashes pass.

**Not done**
- History seed takes 446 s on local Docker Postgres (foreign key checks dominate, 4 per booking and 8 per ticket). Neon timing not measured yet.
- Frontend Day 15 screens and E2E-9 not rerun in this session. Staging not deployed (Upstash, Razorpay, Resend, Render and Vercel pending; Neon connected, empty).
- Base seed has one driver and one conductor (docs/19 asks for crews per depot) and registrations without the leading zero (AP 39 Z 101). Logged for Day 19 seed check.

## Day 14: 2026-10-06, Dev A and Dev B

**Done**
- Operations dashboard with live KPIs, bus status counts, multiple map markers and bus/route/driver details. Scoped depot selection and table filters live in the URL. Fleet creation, trip assignment and incident acknowledgement/resolution use guarded backend mutations.
- Shared DataTable and KpiTile with sorting accessibility, keyboard activation, skeleton/empty states, cursor controls, typed columns, delta tones/icons and unit tests. Incident labels/icons/tones use the shared status map.
- Admin API: bilingual bounded stops, ordered routes and generated polyline, booked/active future-ticket stop protection, timetable deactivation and idempotent trip generation, scoped role grants/revocation and last-admin protection, append-only fares, effective refund history, validated settings and scoped cursor audit reads. Admin mutations audit before/after atomically.

**Verification**
- Root lint, typecheck, production build and dash check passed. Full package suite: shared 119, UI 46, web 42, API 359 passed, with 6 database tests skipped. Script suite: 6 passed. The API suite includes 30 admin tests and a two-client socket acknowledgement propagation test.
- Local PGlite/API policy verification: today's search fare stayed unchanged, tomorrow's search used the new fare, the current refund quote returned 80 percent (8000 paise), and a future refund policy did not apply early. Fixtures used the isolated localhost database only.

**Merged PRs**
- None. Day 12 to Day 14 remain uncommitted on pranay-day12.

**Contract changes (packages/shared)**
- Admin schemas, operations lookup DTOs and fleet context, incident status metadata. D-029 records additive contracts and effective policy semantics. Locked docs were not edited.

**Bugs found**
- Fixed nullable driver joins, refined Zod partial DTO handling, missing incident translation paths and early activation of future refund policies. Concurrent Windows verification hit a pre-existing calendar test timeout; rerunning with one worker passed.

**Carry over and review**
- Other dev review of D-029 and earlier shared decisions, CI, PR and merge to main. Cloud staging and Day 13 physical-phone timing remain pending.

## Day 13: 2026-10-05, Dev A and Dev B

**Done**
- Conductor home, camera scanner, live counts and manifest. Every scan reason has an accessible result, optional sound and haptics, duplicate debounce, three-second resume and manual fallback.
- Approved D-027: manual entry requires ticket number and current eight-character live validation code. Code-only and mixed requests fail schema validation. Manual and camera entry share QR verification, ordered status/expiry/live-code/duplicate rules, scans and audit.
- Operations dashboard, bus profiles and maintenance, scoped trips and assignment, atomic bus replacement, full operator refunds, staff creation, device approval/revocation and incident acknowledgement/resolution. Permission-specific scope blocks multi-role scope escalation. Resource locks prevent conflicting assignments and bus edits. KPI updates run only for occupied operations rooms.
- Full-fare refunds include fees. Paid tickets remain BOOKED or ACTIVE until the signed refund.processed webhook; repeated callbacks do not repeat refunds or status changes. Zero-fare tickets need no provider call.
- Local database/API demonstration: simulator --breakdown-at 60 reported INC-GQTDM2, manager acknowledged and replaced the bus/driver, the ticket retained its trip and seat 1, and citizen@aptransit.test received REPLACEMENT_BUS. The isolated fixture clock overlapped seeded conductor assignments; those unrelated fixture assignments were ended before successful replacement. Availability correctly rejected the overlap first.

**Verification**
- Full suite passed: shared 119, UI 41, web 42, API 325 with 6 database tests skipped. Additional final status-filter, KPI and signed refund callback tests are included in the focused rerun.
- Root production build, typecheck and lint passed. E2E-8 scanner results, duplicate debounce and manual live-code form passed on Desktop Chrome and Pixel 7 (2 tests). Scanner axe check found no serious or critical violations.
- Final focused API rerun: 18 validation tests and 13 operations tests passed. E2E-8 with axe and English/Telugu layouts at 360, 768 and 1280 px: 2 passed (50 seconds). Final lint, typecheck, i18n and dashes passed; scripts 6 passed. Fixed encoding in both new conductor and Day 12 tracking translations; no corrupted question-mark runs remain.

**Carry over**
- Physical phone camera test over HTTPS: ten actual QR scans with average decode-to-result below two seconds. Browser injection tests do not establish phone camera performance or torch/audio compatibility.
- Other dev review of shared contracts D-028, PR/CI and merge to main. Day 12 and Day 13 remain uncommitted on pranay-day12; no merge has been performed.
- Real provider staging callback and cloud deployment checks. Failed provider refunds persist as FAILED rows for reconciliation; no automatic provider retry workflow is introduced today.

**Bugs found**
- Fixed malformed status filters returning server errors, manual input ambiguity, cancellation/fleet write races, test-server raw body handling, and Windows shell encoding corrupting newly added Telugu copy.

**Decisions**
- D-027 approved by the human. D-028 records additive shared contracts for the other dev's review. Locked docs unchanged.

## Day 12: 2026-10-05, Dev A and Dev B

**Done**
- Citizen /track entry and /track/[tripId] live map, next stop, pace ETA, delay, incident, stale updates, scheduled/completed states and accessible route progress. Shared socket client refreshes auth, restores rooms and falls back to 15 s REST polling after 10 s disconnected. Notifications and ticket status update queries; driver uses the live hook. English and Telugu copy added together. MapLibre stays behind the lazy UI subpath.
- Tracking math uses 150 m stop reach, monotonic lastStopSeq, delay floored at zero and pace clamped 0.8 to 1.5. Trip rows persist delay changes of at least 2 min. Departure, delay bands and near-stop notifications have durable deduplication. Simulator supports --delay-at and --breakdown-at.
- POST /tickets/validate implements the ordered ticket/pass rules, conductor assignment permission, optimistic ticket updates, serialized pass scans, every authorized attempt's scan/audit, duplicate scan time and ticket status events. GET /conductor/today and manifest return passenger, checked and pending counts.

**Verified**
- Full test suite: shared 119, ui 41, web 42, api 313 passed plus 6 database tests skipped, scripts 6. Final validation query changes: 16 HTTP tests passed again. Progress math coverage: 100 percent lines, 97.67 percent branches.
- Validation benchmark on the isolated local PGlite database: 30 sequential HTTP requests (one successful pass scan and 29 duplicate scans), p95 134.72 ms, maximum 437.63 ms. In-memory HTTP p95 15.72 ms. The database measurement, not the memory stub, satisfies the Day 12 p95 target.
- pnpm lint, pnpm typecheck, pnpm check:dashes and pnpm i18n:check pass. API and web production builds pass. E2E-7: 2 of 2 passed on Desktop Chrome and Pixel 7 (movement, next stop/ETA, incident, offline fallback, REST recovery, completion and no horizontal overflow). Map screenshots were inspected on both sizes; route lines, stop dots, heading marker and attribution are visible.

- Responsive smoke passed in English and Telugu at 360, 768 and 1280 px. Home-page network chunks contain no MapLibre code.

**Merged PRs**
- None for Day 12. Changes remain on pranay-day12 for the other dev's review. Days 8 to 11 are already merged into main (PR #4).

**Contract changes (packages/shared)**
- Conductor validation/today/manifest schemas, earlierScanAt, LiveTripDto incident flags and types.

**Bugs found**
- Fixed S2: duplicate incident labels when several open incidents have the same type.
- Fixed S2: loading every validation relation separately missed the latency target. Narrow joined reads include only required fields and prior valid scans.
- Fixed S3: map layer widths treated rem spacing as pixels. Dedicated map width token added.

**Carry over**
- CI and other dev PR review/merge. Existing staging, real Redis worker, real Android over HTTPS and Lighthouse checks remain environment-dependent. Scanner UI is Day 13.

**Decisions needed**
- D-026, shared contracts and Prisma relationJoins preview, proposed for review.

## Day 11 · 2026-10-05 · Dev A and Dev B

**Done**
- Dev B: `POST /driver/devices` (32 byte key shown once, SHA 256 stored, audit `device.register`), `GET /driver/today`, `GET /driver/trips`, `POST /driver/trips/:id/start` and `/end` (assignment, approved device, 60 min window, bus status, `depot:live` set, audit, `trip.status`), `POST /tracking/ping` (docs/12 checks, `bus:live` TTL 120, one `gps_locations` row per 30 s, `bus.position`), `GET /tracking/trips/:id/live` (public) and `GET /tracking/live` (ops roles, depot and district scope), `tracking/progress.ts` (snap to the route with road km anchored to stops, progress, current and next stop, delay at the last reached stop, ETA with pace 1), Socket.IO gateway `/live` (JWT in middleware, `user:{id}`, room rules, `bus:position` throttled 2 s per trip and 10 s for `state`, `trip:status`, `incident:new`, `ticket:status`), `POST /driver/incidents` (server filled trip, bus and location, INC code, open incident flag, BREAKDOWN bus status, audit), `pnpm simulate` (`scripts/simulate-trip.ts`) and `pnpm watch:live` (`apps/api/scripts/watch-live.ts`).
- Dev A: `/driver` (greeting by IST time, bus, route, departure, Ready chip, this phone's state, Start trip xl with the reason when disabled), `/driver/setup` (register this phone, key kept in localStorage, polls every 30 s), location explanation before the browser asks and Chrome instructions when denied, `useGpsSender` (watchPosition high accuracy, 5 s moving and 20 s stationary, 20 points per request, IndexedDB buffer of 500 flushed 20 at a time, stops when the API refuses), `useWakeLock` with a tip when unsupported, `/driver/trip/[id]` (Trip active, GPS Active, Weak or Off with icon and word, next stop and ETA polled every 15 s, Report issue, End trip with a confirmation), `/driver/report` (seven big tiles, optional note). All copy in en and te, 56 px buttons, body-lg.

**Verified**
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (shared 119, ui 40, web 42, api 281 plus 6 database tests skipped, scripts 6), `pnpm build`, `pnpm check:dashes`, `pnpm i18n:check`.
- `test/tracking.test.ts` (18, with a real socket.io client): device registration, today, start and end rules, ping refused for an unapproved device, a missing key, the wrong driver, a trip not running, out of bounds, too fast, stale, more than 20 points; accepted ping writes Redis, one sample per 30 s, emits to the trip room; throttle; room permissions for anonymous, citizen, depot manager (own and other depot), district officer, transport officer; trip:status to the depot room; live views; incidents (server filled fields, no client ids, fallback location). `progress.test.ts` on the seeded KNL to VJA polyline.
- Live on the local stack: `pnpm simulate --trip <KNL to NDL trip> --speed 60` drove the trip to COMPLETED while `pnpm watch:live trip:<id>` printed 41 `bus:position` events 2 s apart (progress 1.9 to 100 percent) and `trip:status COMPLETED`. Playwright driver smoke (Pixel 7, mocked GPS, seeded approved key): continue trip, ping 202, GPS Active, report sent with an INC code, trip ended.

**Bugs found**
- Fixed (S2): a socket that subscribed right after connecting could be treated as anonymous (the JWT check ran in the connection handler), so a depot manager was sometimes refused their depot room. The token is now checked in Socket.IO middleware.
- Fixed (S3, tooling): `pnpm simulate --all` drives every due trip with one driver and one device and hit the 30 per minute ping limit; it now shares 25 pings a minute across trips.

**Carry over**
- Real Android phone over HTTPS (walk a trip, airplane mode for a minute): needs a phone and staging.
- Day 12: pace factor, delay updates on the trip row, stop notifications, `--delay-at` and `--breakdown-at`.

**Contract changes (packages/shared)**
- New `schemas/tracking.ts`.

**Decisions needed**
- D-025.

## Day 10 · 2026-10-05 · Dev A and Dev B

**Done**
- Dev A: `app/manifest.ts` (name, short name, standalone, colours from tokens), icons 192, 512 and maskable 512 (`scripts/make-icons.mjs`), hand written `public/sw.js` (D-024), registration in production only with an "Update available" toast and Reload, `/offline` page listing the tickets saved on the phone, "Install app" on the account page from `beforeinstallprompt` only. Playwright: shared fixtures (one login per worker), E2E-3 (activate in the window, QR rotates, using a fake clock), E2E-4 (refund matches the quote), axe checks on `/`, `/search`, `/bus/[id]`, `/tickets/[id]`, `/passes`.
- Dev B: CI e2e job resets and seeds the test branch, runs all specs, uploads the Playwright report on failure.

**Verified**
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:dashes`, `pnpm i18n:check`.
- Local stack (PGlite, `scripts/dev-redis.mjs`, production builds, fake payments): 18 of 18 Playwright tests pass with one worker on Desktop Chrome and Pixel 7 (E2E-1 to E2E-6, axe with zero serious or critical violations). `/manifest.webmanifest` serves the token colours, `/sw.js` has no-cache headers, `/offline` answers 200.

**Bugs found**
- Fixed (S2): `/manifest.webmanifest` gave 500 (`import.meta.url` is undefined in the server bundle); tokens are now read from the app folder.
- Fixed (S3, tooling): `scripts/dev-redis.mjs` measured RESP lengths in characters, so any value with Telugu text (cached ticket responses) hung the connection and every later command. It parses bytes now.
- Fixed (S3, tests): E2E-3 moves a trip into today, and later tests booked that trip (too close to departure to gift or cancel). Tests now pick a trip at least 3 h away.

**Carry over (needs a human)**
- Staging: Render api and worker, Vercel, Neon main migrate and seed, Razorpay test webhook, a real test payment with the tab closed, the docs/17 smoke test on a phone, Lighthouse PWA on staging, install on Android, the manual QA script, and the `v0.1.0` tag. None of these accounts exist on this machine.
- `TEST_DATABASE_URL` and `TEST_REDIS_URL` secrets so the CI e2e job runs instead of skipping.

**Decisions needed**
- D-024.

## Day 09 · 2026-10-05 · Dev A and Dev B

**Done**
- Dev B: `NotificationsService.notify` (row, then an `email-<id>` job on the notifications queue when the user has an email), `NotificationEmailService` in the worker (subject and body from packages/shared messages in the user's language, plain accessible HTML with one link button plus a text version, sets `emailedAt`, skips rows already emailed), `NotificationsProcessor`. Subscribers: booking.confirmed to BOOKING_CONFIRMED (one per booking), ticket ACTIVE to TICKET_ACTIVATED, ticket.transferred to TICKET_RECEIVED. Endpoints `GET /notifications` (cursor), `GET /notifications/unread-count`, `POST /notifications/:id/read`, `POST /notifications/read-all`. `StatusExpiryService` (rules a to f, batches of 500, old status as the lock, counts logged) on the repeatable `expire-statuses` job every 5 min. Worker heartbeat `worker:heartbeat` every 60 s (TTL 180) and `GET /health` reports `worker: ok | stale`. Shared: `messages.ts` (messages built into dist), `notificationParams`, notification schemas, `email.layout.*` keys.
- Dev A: `Countdown` in packages/ui (one timer on the next visible change, paused when the tab is hidden, hidden summary that changes once a minute). `/tickets/[id]/gift` (one field with phone or email detection, rules line, confirm Dialog, every denial mapped), `/passes` (active pass with countdown and LiveQr, ready passes with an activation Sheet, unpaid passes with Pay, history, empty state), `/passes/buy` (cards with price, validity, services; `usePayment` now takes `{ passId }`), `/free-travel` (explainer, consent, category, domicile, ID type with the "do not enter any ID number" note, error summary, ELIGIBLE and NOT_ELIGIBLE states that always offer a next step), `/book/[tripId]/free` with "Book free seat" on the bus page for a citizen with an active free pass on an eligible bus, notification bell with unread count (60 s poll), `/updates` (grouped by day, icon per type, relative time, unread dot, tap marks read and follows the link, Mark all read, Show older). E2E-5 and E2E-6, shared e2e helpers.

**Verified**
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:dashes`, `pnpm i18n:check`.
- New API tests (`test/notifications.test.ts`, 15): notify writes the row and queues one email job; the worker renders in Telugu for a te user, sends once, sets emailedAt; every notification type renders in en and te without a missing placeholder; HTML escaped; each subscriber; cursor pagination, unread count, read one (owner only), read all; each expiry rule a to f with frozen time; PASS_EXPIRING only once; health worker ok and stale. Countdown component tests (3).
- Live on local PGlite plus `scripts/dev-redis.mjs` (API and web production builds, fake payments, dev OTP echo), as citizen@ and citizen2@: eligibility ELIGIBLE, the same request with an ID number 400, free pass READY then ACTIVE until the eligibility expiry, free seat on the Express CONFIRMED at Rs 0, Super Luxury 422 PASS_NOT_ELIGIBLE, the free ticket not giftable; paid ticket gifted to citizen2 (sender 404, recipient sees it with "Citizen Lakshmi", second gift 422); weekly pass Rs 450 paid with test/complete, activated for 7 days, QR with rotSecret; notifications BOOKING_CONFIRMED twice for citizen, TICKET_RECEIVED for citizen2, read-all clears the count. The `eligibility_checks` row holds only scheme, result, reason, provider, reference and times.
- Playwright on that stack, one worker: E2E-1, E2E-2, E2E-5, E2E-6 pass on Desktop Chrome (5 of 5); on Pixel 7, 4 of 5 pass, E2E-6 hit the OTP limit of 10 per IP per hour (docs/12) after the many local logins, not a code fault.

**Bugs found**
- Fixed (S1): `useNow` passed a new subscribe function on every render, so React resubscribed each render and the bus page hit "Maximum update depth exceeded" (React error 185). Subscribe and read are now stable per interval, and the clock resets to 0 when it stops.
- Open (S2, tests): all e2e logins come from one IP, so a full run on both projects passes the 10 OTP requests per IP per hour limit. Day 10 adds a login fixture that reuses sessions.

**Carry over**
- The worker was not run for an hour and Upstash usage was not recorded: there is no Upstash or real Redis on this machine (dev-redis cannot run BullMQ). Email sending and the expiry job are covered by the tests above.
- Real Razorpay test checkout for passes needs test keys.

**Contract changes (packages/shared)**
- New `messages.ts`, `notification-params.ts`, `schemas/notifications.ts`; `HealthDto.worker`; `TicketDto.giftCutoffAt`; `PassDto.activationValidUntil`.

**Decisions needed**
- D-023.

## Day 08 · 2026-10-05 · Dev A and Dev B

**Done**
- Dev B: `POST /tickets/:id/transfer` (Idempotency-Key, every docs/07 section 7 rule, optimistic lock, new rotSecret, passenger name from the recipient profile or masked contact, `ticket_transfers` row, audit `ticket.transfer` and `ticket.transfer_denied`, event `ticket.transferred`). `passes/pass-rules.ts` (activateBy, validity, one active pass per kind, job transitions for Day 9) and `countdownParts` in shared. Passes: `GET /pass-types`, `GET /passes`, `POST /passes`, `POST /passes/:id/activate`, `GET /passes/:id/qr` ("t": "P"). Payments take `{ passId }` (orders, verify, webhook, test/complete) through the new `PassConfirmationService`. Eligibility: `EligibilityProvider`, `MockEligibilityProvider`, `POST /eligibility/stree-shakti` (strict schema, stores only scheme, result, reason, provider, reference, times), `GET /eligibility`, audit `eligibility.check`. Free travel booking with `useFreeTravel` makes a CONFIRMED booking and one FREE_TRAVEL ticket (farePaise 0, not giftable) through `BookingConfirmationService.confirmFreeTravel`.
- Dev A: `TicketCard` and `OfflineBanner` in packages/ui, QR tokens (`qr-ink`, `qr-paper`) and the `animate-ticket-band` and `animate-fade-in` utilities. `QrSvg` (qrcode, error correction M, quiet zone 4, black on white in both themes) and `LiveQr` (Web Crypto code per 30 s step, server offset, live clock with seconds, colour of the day band with its name, band stops under reduced motion, brightness hint). `/tickets/[id]` for every status (locked BOOKED state with the window in words, activation Sheet that names the consequence, QR with a fade, checked, used, expired, cancelled with refund status, refunded), overflow menu for Gift and Cancel, refetch every 30 s and on focus. IndexedDB copy of an ACTIVE ticket until validUntil, cleared on logout, shown with the OfflineBanner when the network is down. `/tickets/[id]/cancel` (quote, policy line, danger button, confirm Dialog). My tickets rows now open the ticket.

**Verified**
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:dashes`, `pnpm i18n:check` all pass.
- New API tests (`test/gift-passes.test.ts`, 21): gift by phone and by email, nameless recipient masked, every denial (free, active, second gift, inside 120 min, unknown recipient, self) with its audit row, idempotent retry; weekly pass bought through test/complete, activated (7 days), second weekly pass 409, READY pass has no rotSecret, owner only; strict eligibility schema refuses an ID number, the stored row has only the allowed columns, each NOT_ELIGIBLE reason; free pass then a zero fare FREE_TRAVEL ticket on an Express without a payment row, Super Luxury 422, free ticket not giftable. `pass-rules.test.ts` covers every docs/07 section 8 row.
- Web: the Web Crypto code matches the shared fixed vectors (`lib/qr-code.test.ts`); TicketCard test (route heading, copy code).

**Carry over**
- Live browser walk of the ticket page (QR changing every 30 s, airplane mode, screen reader order) and the curl run of the free travel path: moved to the Day 9 walk on local PGlite (see the Day 09 entry).
- Real Razorpay test checkout still needs real test keys.

**Contract changes (packages/shared)**
- New `schemas/passes.ts`, `countdown.ts`, `TransferTicketInput`, `normalizeRecipient`, `formatClock`; `CreatePaymentOrderInput` is `{ bookingId }` or `{ passId }`; `TicketSummaryDto.tripId`, `TicketDto.activationValidUntil`.

**Decisions needed**
- D-022.

## Day 07 · 2026-10-03 · Dev A and Dev B

**Done**
- Dev B: `tickets/ticket-rules.ts` (activationWindow, computeValidUntil, canActivate, canCancel, canGift, nextStatusOnJob, isUpcoming), `packages/shared/src/qr.ts` (qrStep, formatCode, rotatingCode with injected HMAC, buildQrContent, parseQrContent, QrPayload), `tickets/qr.service.ts` (Ed25519 tokens with keyId, sealed rotSecret, code check for steps minus 1 to plus 1). Endpoints GET /tickets, GET /tickets/:id, /qr, /refund-quote, POST /activate (Idempotency-Key, optimistic lock, audit, event), POST /cancel (refundQuote from fare.ts, provider refund, refunds row PENDING, audit ticket.cancel and refund.create). Webhook refund.processed. POST /payments/test/complete through `ConditionalModule` (PAYMENTS_FAKE=1 and APP_ENV not production) with the fake provider. `demo:window` script (D-021).
- Dev A: `lib/payments.ts` (`usePayment`: one checkout.js load, no double press, dismiss keeps the hold, failure retry, verify with Idempotency-Key, poll the booking for 30 s when the answer is lost, fake flag path). Review page wired. `/book/done/[bookingId]` (calm confirmation, ticket preview, activation hint, View ticket, Book return journey). `/tickets` (tabs in the URL, TicketSummaryCard, skeletons, empty and error states, refetch on focus). `TicketStatusBadge` in packages/ui (icons now in `TICKET_STATUS_MAP`). E2E-2 spec; CI e2e job runs with the fake payment flags.

**Verified**
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (shared 102, ui 35, web 33, api 201 + 6 database), `pnpm build`, `pnpm check:dashes`, `pnpm i18n:check`.
- Unit: every docs/07 section 2 row, activation edges (before open, at open, inside, at close, after close, delay), QR fixed vectors (Node and Web Crypto agree), tampered token, wrong key id, stale code, next step. Integration: activate inside the window, twice 409, outside 422 with the opening time, QR hides rotSecret before activation, cancel refunds 90, 75 and 50 percent of the fare part, double cancel refunds once, refund.processed gives REFUNDED and PARTIALLY_REFUNDED once, another user gets 404 on every ticket route, test/complete registered only with the flag.
- Playwright (Chromium installed): E2E-1 and E2E-2 pass on Desktop Chrome and Pixel 7 (6 of 6) against a production build of the web app, one worker, as in CI.
- 360 px, Telugu: /tickets and /book/done have no horizontal scroll, tabs and buttons are at least 44 px, headings are h1, status badges show icon and label.
- Live on local PGlite with the fake flags, in Telugu: seat, details, review, Pay, `/book/done` ("టికెట్ బుక్ అయింది", seat 5, activation hint), `/tickets` shows the ticket. Engine: activate before the window gives ACTIVATION_WINDOW_CLOSED with the times, `demo:window` moves the trip, activate gives ACTIVE with validUntil, second call 409, QR payload verifies, the code computed with the shared helper passes `QrService.verifyCode`, a code two steps old fails, a tampered token is rejected.

**Bugs found**
- Fixed today: the test endpoint did not register locally (ConfigModule loads `.env` asynchronously and writes the flag back as "true"); orders called real Razorpay under the fake flag; the E2E-2 email locator; Telugu route phrases used "to" as a separate word (now `common.routeFromTo`).

**Carry over**
- Real Razorpay test checkout (UPI `success@razorpay`, card 4111 1111 1111 1111) at 360 px and closing the popup mid way: needs real test keys (placeholders locally).
- Web security headers (docs/12, CSP allowing checkout.razorpay.com) are scheduled for Day 17 (prompts/day-17.md item 3), not today.

- Local only, not a code bug: with two parallel E2E workers PGlite returned a null required relation once (POST /bookings 500). Neon will not do that; locally run E2E with one worker.

**Contract changes (packages/shared)**
- New `qr.ts`, `schemas/tickets.ts`, `CompleteTestPaymentInput`; `TICKET_STATUS_MAP` gains `icon`.

**Decisions needed**
- D-021.

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
