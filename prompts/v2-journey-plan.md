# AP TransitOS v2 · Journey first, multi state, minimal UI

**Who this is for:** the dev (or AI tool) picking up the next round of work after Day 20.
**Goal:** rebuild the product around the real passenger journey the client described, make the platform ready for more than one state, support a conductor or a door scanner machine, and give every app a simple, minimal look.

Read this whole file before starting. Then work phase by phase. Each phase has a goal, the exact changes, a copy paste prompt for your AI tool, and a "Done when" checklist.

---

## 0. Before you start

**Read first:** `AGENTS.md` (hard rules), `progress/handoff.md` (patterns and gotchas), `docs/00-index.md`, the README of every package you touch.

**Setup**

```bash
git checkout main
git pull
pnpm install
pnpm --filter api exec prisma generate
pnpm typecheck
```

**Housekeeping first:** `main` already has the Next.js 16.3.8 bump (advisory GHSA-cjq9-62q9-8jv4) and the login test code fix. Update the Next version in `docs/04-tech-stack.md` line 115 and log it. Login email delivery still needs the Resend domain and Render env changes (see "Login" in section 1).

**Design reference:** `prompts/v2-design-spec.md` holds every colour, font, spacing, component and UX rule. Read it before any UI work.

**Hard rules that bite most often (from AGENTS.md)**

1. No em dash or en dash anywhere (code, docs, seed, commits). `pnpm check:dashes` must pass.
2. Every visible string is a next-intl key in both `apps/web/messages/en.json` and `te.json`, same commit.
3. Tokens only: no raw hex, no arbitrary px, no inline styles.
4. Status labels, colours and icons come only from `packages/shared/src/status.ts`.
5. Server is the source of truth for payment, ticket status, eligibility, fare, seats, location.
6. Every mutating endpoint: zod validation, auth guard, permission, rate limit, audit entry when docs/12 lists it.
7. Money in integer paise. Time stored UTC, shown `Asia/Kolkata`.
8. No new dependency unless logged in `progress/decisions-log.md`. This plan needs none.
9. WCAG 2.2 AA. 44 px targets (56 px in driver, conductor, scanner apps).
10. Every screen has loading, empty, error (with retry) and success states.
11. Business rules are not invented. The new pass prices in this plan are DEMO values, marked as such.

**Locked docs:** this round changes docs 05, 06, 07, 08, 09, 11, 12, 13. Both devs agreed. Edit each doc in the same PR as the phase that needs it and add a decision entry (D-033 onward, latest today is D-032).

**Git**

- One branch per phase: `a/<name>` for frontend, `b/<name>` for backend. Merge to `main` through a PR reviewed by the other dev.
- Commit titles only, imperative, under 60 characters, no trailing period. No `Co-authored-by` or any AI attribution line.

**Machine note:** on a slow laptop `pnpm test` (turbo, all packages in parallel) can fail with "Timeout waiting for worker to respond". That is not a code failure. Run packages one by one: `pnpm --filter @aptransit/ui test`, then `api`, `web`, `@aptransit/shared`.

---

## 1. Why we are doing this

The client meeting corrected the product model. The client said: understand the real world journey first, then design the technology around it.

What is wrong or missing today (checked in the code):

| Area | Today | Needed |
| --- | --- | --- |
| Geography | District is the top level. AP is hardcoded in GPS bounds (`tracking.service.ts` `AP_BOX`), map centre (`map-view.tsx`), time zone literals, gov breadcrumb ("Andhra Pradesh") | State > District > Depot > Route > Bus > Trip. Adding Telangana must be data, not a rebuild |
| Boarding record | `TicketScan` stores ticket, trip, conductor, result. No bus, stop, location or device | Every scan records bus, stop, time, location, who or what scanned |
| Segment check | Ticket must match the trip. No stop check. Passes only check service type | Reject boarding outside the ticket's stops; passes check validity window |
| Validator | Only a logged in conductor can scan | Conductor OR a door scanner machine bound to a bus. Later: driver only buses |
| Passes | Weekly, Monthly, Free travel | Single ticket, Day, Weekly, Monthly, Family/Group, School, Annual. Valid from activation |
| Driver | Duty, start, report problem, end. No break, no SOS. Reports never reach passengers as notifications | Break, SOS/medical with escalation, delay report that changes ETA and notifies passengers |
| Field apps | Driver and conductor share a slim top bar, no nav, no bell | One shell: same nav pattern, bell, status chips, different functions |
| Gov data | Daily totals per district, depot, route | Stop by hour boardings: "Stop X, 08:00 to 09:00, average 42 boarded" |
| Citizen | No "my location", no "arrive by", scheduled times only | Nearest stop, leave at / arrive by, live vs scheduled times, ticket type step |
| UI | Calm civic, but busy in places | Simple, minimal, fewer elements per screen |
| Login | Codes are not emailed on staging (Resend test sender `onboarding@resend.dev`, `OTP_DEV_ECHO=1`). The screen now shows the test code | Verify a domain in Resend, set `EMAIL_FROM` and `APP_ENV=staging` on Render, then `OTP_DEV_ECHO=0`; clear `EMAIL_DELIVERY_FAILED` error instead of a 500 |

---

## 2. The passenger journey (the foundation)

Every phase serves this flow. If a change does not help a step here, it waits.

1. User opens the app. Uses "my location" or picks a stop.
2. Selects From and To. Chooses Leave at or Arrive by.
3. Sees buses with live and scheduled times.
4. Selects a bus.
5. Selects ticket type: Single, Use my pass, Free travel.
6. Pays (server confirms).
7. Gets a QR ticket.
8. Activates the ticket.
9. Goes to the bus.
10. Shows the QR to the conductor or to the door scanner.
11. QR gets scanned.
12. Server verifies: signature, rotating code, trip, stop segment, validity, group size.
13. Boarding is recorded: bus, stop, time, location, validator (conductor or device).
14. Passenger enters and sits.
15. Bus location keeps updating.
16. Driver reports delay, issue, break or SOS.
17. Passengers on that trip get an update. Depot ops get alerted.
18. Passenger reaches the destination.
19. Boarding data is rolled up per stop per hour.
20. Government dashboard shows demand and insight.

**Validation always flows this way:** Passenger QR -> Conductor or device scan -> Server verification -> Boarding recorded. The passenger owns the ticket. The conductor or the machine only verifies it.

**Validator phases the architecture must allow from day one:**

| Phase | At the door |
| --- | --- |
| 1 | Passenger + conductor (phone scanner) |
| 2 | Passenger + door scanner machine |
| 3 | Passenger + automatic validation + driver only |

**Out of scope for this round:** AirTag style tracking tags. Add one line to `progress/phase-2-backlog.md` as "future low cost bus tracking hardware, research". Do not promise it works like Apple Find My.

---

## 3. Design rules for every phase

- **Keep semantic token names** (`bg-surface`, `text-muted`, status tones). Change only values. One edit restyles every screen and E2E selectors survive.
- **Keep the `APT-` ticket prefix and the `APT1` QR prefix platform wide.** `APT1` is a format version; changing it invalidates live QRs. Per state prefixes apply only to new network codes (depot, route, stop).
- **Time zone:** one constant `PLATFORM_TIME_ZONE = "Asia/Kolkata"` in `packages/shared/src/time.ts`, plus a `State.timezone` column. Admin refuses a state whose zone differs. Full per state zones go to the backlog (every Indian state is IST).
- **Break is a `TripBreak` row.** The trip stays `RUNNING`, because validation (`conductor.service.ts`) and tracking require `RUNNING`. Display status `ON_BREAK` is derived.
- **Postgres enum additions go in their own migration**, before any backfill that uses the new value (`ALTER TYPE ... ADD VALUE` cannot be used in the same transaction).
- **Stop based checks are skipped when the stop source is `NONE`.** Bad GPS must never strand a passenger.
- **Keep accessible names, en.json strings and test ids** when restyling. Around 131 E2E selectors use role and name.

---

## 4. Phases and order

| Phase | Name | Owner | Size | Depends on |
| --- | --- | --- | --- | --- |
| P1 | Minimal UI foundation | Dev A | 2 days | none |
| P2 | State model, multi state scope | Dev B | 2 to 3 days | none |
| P3 | Boarding record, segment validation | Dev B | 2 days | P2 |
| P4 | Pass catalog | Dev B then Dev A | 2 days | P3 |
| P5 | Door scanner, driver only mode | Both | 3 days | P3 |
| P6 | Unified field shell | Dev A | 1 day | P1 |
| P7 | Driver operations (break, SOS, delay) | Both | 3 days | P6 |
| P8 | Stop demand analytics | Both | 2.5 days | P3 |
| P9 | Citizen journey UX | Dev A (+1 day Dev B) | 3 days | P1, P4 |
| P10 | Minimal rollout and hardening | Dev A | 2 days | all |

**Order:** P1 and P2 in parallel, then P3, then P4 and P6, then P5, P7, P8, P9, then P10.

---

## P1 · Minimal UI foundation (Dev A, 2 days)

**Goal:** a simple, minimal visual system in place before any new screen is built. No new dependency.

**Full spec:** `prompts/v2-design-spec.md` (contrast checked colour tokens for light and dark, type scale, spacing, radius, motion, every component, UX rules, wireframes, QA checklist). It replaces docs/09 when this phase lands.

**Minimal principles (summary; write the full spec into docs/09):**

1. One accent colour (keep transit blue `--primary`). Everything else is neutral greys and white.
2. Flat surfaces. Cards use a hairline border or a sunken background, no shadow. Shadow only for overlays (sheet, dialog, toast).
3. Generous whitespace: 8 px rhythm, bigger section gaps, fewer dividers.
4. Clear type hierarchy: one display or h1 per screen, body 16, muted secondary text. Fewer font weights (400 and 600).
5. One primary action per screen. Secondary actions are ghost or text buttons.
6. Fewer elements: hide rarely used details behind "More details" (disclosure), drop decorative icons, keep icons only next to a label or as status.
7. Status chips stay (label + icon + colour), but use the soft tone, not solid, except for errors and SOS.
8. Motion: CSS only, existing tokens (`duration-fast/base/slow`, `ease-out`). Fade and small slide for change only. Reduced motion respected.
9. Big touch targets in field apps (56 px), large text for scan results.

**Changes**

- `packages/ui/src/tokens.css`: new values for neutrals, surface, border, radius (slightly larger, softer), elevation (only overlay levels), spacing scale. Additive tokens: `--surface-sunken`, `--border-subtle`. Keep dark mode blocks in sync.
- `packages/ui/src/cn.ts`: register any new class names.
- Refresh in this order: `button`, `card`, `status-badge`, `tabs`, `sheet`, `dialog`, `skeleton`, `toast`, `trip-card`, `ticket-card`, `kpi-tile`, `empty-state`.
- New components in `packages/ui/src/components`:
  - `bottom-nav.tsx` (field apps, 56 px items, label + icon, `aria-current`).
  - `status-chip.tsx` (small soft chip for online, GPS, trip, scanner state).
  - `result-splash.tsx` (full screen scan result: tone, icon, big label, reason; `role="status"`).
  - `hold-button.tsx` (press and hold 3 s for SOS; shows progress; cancel on release; keyboard: hold Space or Enter; screen reader text explains).
- `apps/web/app/design` page: show every component in light and dark.
- Docs: rewrite `docs/09-design-system.md` with the principles above. Decision **D-033** "Minimal visual refresh, no new UI dependency, bottom nav for field apps".

**Prompt for your AI tool**

```text
P1, Dev A. Goal: minimal visual refresh of packages/ui with no new dependency.
Read AGENTS.md, progress/handoff.md, docs/09-design-system.md, packages/ui/README.md, packages/ui/src/tokens.css, prompts/v2-journey-plan.md (section P1), prompts/v2-design-spec.md (all of it).
1. Update token values in packages/ui/src/tokens.css exactly as prompts/v2-design-spec.md sections 2, 3, 5 and 12: colours for light and dark, type scale with tracking and display-lg, radius 8/12/16/24, add --surface-sunken and --border-subtle. Keep every existing token name. Keep light, dark by system and dark by choice blocks in sync.
2. Refresh button, card, status-badge, tabs, sheet, dialog, skeleton, toast, trip-card, ticket-card, kpi-tile, empty-state to the minimal principles in section P1. Keep props, accessible names and test ids unchanged.
3. Add bottom-nav, status-chip, result-splash, hold-button components with tests (render, a11y roles, keyboard for hold-button).
4. Show all of them on /design in light and dark.
5. Rewrite docs/09-design-system.md with the 9 minimal principles; add D-033 to progress/decisions-log.md.
Rules: tokens only, no raw hex outside tokens.css, no new dependency, no em or en dash.
Verify: pnpm --filter @aptransit/ui test, pnpm --filter web typecheck, pnpm check:classes, pnpm check:dashes, route sweep e2e at 360 and 1280 px.
```

**Done when**

- [ ] Token values changed, names unchanged, contrast AA in light and dark (add a test that reads tokens.css).
- [ ] 12 primitives refreshed, 4 new components with tests.
- [ ] `/design` shows everything. Route sweep and axe pass.
- [ ] docs/09 rewritten, D-033 logged.

---

## P2 · State model and multi state scope (Dev B, 2 to 3 days)

**Goal:** State > District > Depot > Route > Bus > Trip. AP becomes a data row. A second state works without code changes.

**Schema (`apps/api/prisma/schema.prisma`)**

```prisma
model State {
  id          String     @id @default(cuid())
  code        String     @unique          // "AP", "TG"
  nameEn      String
  nameTe      String
  timezone    String     @default("Asia/Kolkata")
  codePrefix  String                       // for new depot, route, stop codes
  minLat      Float
  minLng      Float
  maxLat      Float
  maxLng      Float
  centerLat   Float
  centerLng   Float
  defaultZoom Int        @default(7)
  isActive    Boolean    @default(true)
  districts   District[]
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  @@map("states")
}
```

- Add `stateId` to `District` (required after backfill), `UserRole` (nullable; set for STATE_ADMIN and TRANSPORT_OFFICER), `PassType` (nullable, null means all states), `DailyStats` (nullable, for the state level row).

**Migrations**

1. `states` table and nullable `stateId` columns.
2. Insert AP with a fixed id and AP bounds `[76.7, 12.6, 84.8, 19.95]`, centre `[78, 16]`. Backfill districts, user_roles (state roles), pass_types, daily_stats. Then `districts.stateId` NOT NULL plus index.

**API**

- `apps/api/src/common/services/scope.service.ts`: SUPER_ADMIN returns `{}` (platform wide). STATE_ADMIN and TRANSPORT_OFFICER return `{ district: { stateId } }`. Add `assertStateAccess(user, stateId)`.
- `apps/api/src/modules/tracking/live.gateway.ts`: room `state` becomes `state:{id}`. `trip-context.service.ts` `roomsOf` adds the state room. Web and API must deploy together.
- `apps/api/src/modules/tracking/tracking.service.ts`: replace `AP_BOX` with the trip's state bounds plus about 0.5 degrees, cached in TripContext.
- New `GET /network/states` (public): id, code, names, centre, bounds, zoom.
- `gov.service.ts` overview and map take a `stateId`. `rollups.service.ts` writes one state row per state.
- Replace `'Asia/Kolkata'` literals in `analytics.service.ts` and `worker.ts` with `PLATFORM_TIME_ZONE`.

**Shared:** `PLATFORM_TIME_ZONE` in `packages/shared/src/time.ts`; `StateDto` in `packages/shared/src/schemas/network.ts`.

**Web**

- `packages/ui/src/components/map-view.tsx`: take `center` and `bounds` props (default from the state).
- `apps/web/lib/gov.ts`, `apps/web/app/driver/driver-home.tsx`, `apps/web/app/(citizen)/updates/updates-view.tsx`: use the constant.
- `apps/web/app/gov/gov-common.tsx`: breadcrumb root is the state name from the API.
- New `/gov/state/[id]`. SUPER_ADMIN sees a state picker on `/gov`.
- Remove "Andhra Pradesh" from generic copy in `messages/en.json` and `te.json` where it means "the platform" (keep it where it names the state).

**Seed:** `apps/api/prisma/seed-data.ts` gets the AP state row. Add a 2 district Telangana stub behind `pnpm db:seed --with-tg` to prove a new state needs only data.

**Docs:** 05 (State model), 08 (state scope), 12 (GPS box per state), 13 (rooms). Decision **D-034**.

**Prompt for your AI tool**

```text
P2, Dev B. Goal: add State above District and remove AP hardcoding.
Read AGENTS.md, progress/handoff.md, docs/05, docs/08, docs/13, apps/api/README.md, prompts/v2-journey-plan.md (section P2).
1. Add model State and stateId columns exactly as section P2. Two migrations: add nullable columns, then insert AP and backfill, then NOT NULL on districts.stateId.
2. Update scope.service.ts (SUPER_ADMIN platform wide, state roles by stateId, assertStateAccess).
3. Rename socket room state to state:{id} in live.gateway.ts and roomsOf.
4. Replace AP_BOX in tracking.service.ts with per state bounds from TripContext.
5. Add GET /network/states. Make gov.service and rollups.service per state.
6. Add PLATFORM_TIME_ZONE to packages/shared/src/time.ts and replace every 'Asia/Kolkata' literal.
7. Seed: AP state row, Telangana stub behind --with-tg.
8. Update docs 05, 08, 12, 13 and add D-034.
Tests: scope across two states, gateway room join, GPS point in TG box accepted for a TG trip and rejected for an AP trip, rollups with two states, E2E-10 still passes.
Rules: zod on every input, audit where docs/12 lists it, no em or en dash.
```

**Done when**

- [ ] AP works exactly as before (all E2E pass).
- [ ] `--with-tg` seed shows Telangana in the gov state picker with its own map and districts.
- [ ] No `"Asia/Kolkata"` literal outside `time.ts` (grep).
- [ ] Docs updated, D-034 logged.

---

## P3 · Boarding record and segment validation (Dev B, 2 days)

**Goal:** every scan becomes a boarding record (bus, stop, time, location, validator), and the server rejects boarding outside the ticket's segment.

**Schema**

```prisma
enum ValidatorKind { CONDUCTOR DOOR_SCANNER }
enum StopSource    { BUS_GPS DEVICE_GPS NONE }

model TicketScan {
  // existing fields stay
  conductorId   String?        // was required
  busId         String?
  stopId        String?
  stopSource    StopSource     @default(NONE)
  lat           Float?
  lng           Float?
  deviceId      String?
  validatorKind ValidatorKind  @default(CONDUCTOR)
  @@index([stopId, scannedAt])
  @@index([busId, scannedAt])
}
```

- New `ScanReason` values in their own migration: `PAST_DESTINATION`, `BEFORE_BOARDING_STOP`, `NOT_YET_VALID`, `ROUTE_NOT_COVERED`.
- Backfill old rows: `validatorKind = CONDUCTOR`, `busId` from `TripAssignment` at `scannedAt`.

**API**

- `apps/api/src/modules/conductor/validate.service.ts`: refactor to `validate(ctx: ValidatorContext, input, actor)` with
  `ValidatorContext = { kind, conductorId?, deviceId?, busId, trip, busType }`. The conductor endpoint builds it from `conductor.current()`. The scanner (P5) builds it from the device. One code path for both.
- New pure function `apps/api/src/modules/conductor/boarding-stop.ts`:
  `resolveBoardingStop(routeStops, live, devicePoint, now) -> { stopId, seq, source }`
  1. If bus live position (`bus:live:{tripId}`) is newer than 60 s: nearest RouteStop within 400 m with `seq <= nextStopSeq`. Source `BUS_GPS`.
  2. Else if the device sent a position inside the state box: same rule. Source `DEVICE_GPS`.
  3. Else `NONE`.
- `apps/api/src/modules/tickets/ticket-rules.ts` `scanStatusReason` gets `stopSeq`, `boardingSeq`, `droppingSeq`, `passWindow`, `routeCovered`. New checks, inserted into the docs/07 section 5 order:
  - 10a. Resolved stop at or after the dropping stop: `PAST_DESTINATION`.
  - 10b. Resolved stop more than 1 stop before the boarding stop: `BEFORE_BOARDING_STOP`.
  - 10c. Pass scanned before `validFrom`: `NOT_YET_VALID`.
  - 11a. Route restricted pass on a trip whose route does not contain both pass stops: `ROUTE_NOT_COVERED`.
  - Stop checks are skipped when source is `NONE`.
- Save `busId`, `stopId`, `stopSource`, `lat`, `lng`, `deviceId`, `validatorKind` on every scan.

**Shared:** reasons in `packages/shared/src/enums.ts`; `SCAN_RESULT_MAP` in `status.ts`; `ValidateTicketResult.context.boardingStop`; en and te messages for each new reason (plain, short: "This ticket ends at Nandyal").

**Docs:** 05, 07 section 5. Decision **D-035**.

**Prompt for your AI tool**

```text
P3, Dev B. Goal: boarding record on every scan and segment validation.
Read AGENTS.md, progress/handoff.md, docs/07 (sections 4 and 5), apps/api/src/modules/conductor/validate.service.ts, apps/api/src/modules/tickets/ticket-rules.ts, prompts/v2-journey-plan.md (section P3).
1. Schema: ValidatorKind, StopSource, new TicketScan fields, conductorId optional, indexes. New ScanReason values in a separate migration. Backfill validatorKind and busId.
2. Refactor ValidateService to take a ValidatorContext; conductor path unchanged in behaviour.
3. Add pure resolveBoardingStop in boarding-stop.ts with table tests (fresh GPS, stale GPS, device GPS, no GPS, stop just passed, 400 m edge).
4. Extend scanStatusReason with the 4 new checks in the order of section P3; skip stop checks when source is NONE.
5. Persist the boarding fields on every scan.
6. Shared enums, status map, en and te messages. Update docs 05 and 07 section 5. Add D-035.
Tests: boarding-stop.test.ts, scan-rules order test, existing day12-validation tests still pass, E2E-8 passes.
```

**Done when**

- [ ] Every new `ticket_scans` row has `busId` and `validatorKind`; `stopId` when GPS is fresh.
- [ ] A Nandyal to Kurnool ticket scanned after Kurnool is rejected with `PAST_DESTINATION`.
- [ ] No GPS means no stop rejection.
- [ ] D-035 logged, docs/07 section 5 updated.

---

## P4 · Pass catalog (Dev B then Dev A, 2 days)

**Goal:** Single ticket plus Day, Weekly, Monthly, Family/Group, School, Annual passes. Validity starts at activation.

**Schema**

- `PassKind` adds `DAY`, `FAMILY`, `SCHOOL`, `ANNUAL` (separate migration).
- `enum PassValidityMode { ROLLING_DAYS UNTIL_DAY_END }`.
- `EligibilityScheme` adds `STUDENT`.
- `PassType` adds `validityMode`, `groupSize Int @default(1)`, `routeRestricted Boolean @default(false)`, `isDemo Boolean @default(false)`, `sortOrder Int`, `stateId` (from P2).
- `Pass` adds `homeStopId?`, `destStopId?`, `groupSize`. Copied at purchase, so later price or rule edits never change a sold pass.

**Rules (`apps/api/src/modules/passes/pass-rules.ts`)**

- Validity starts at activation (already true). `DAY` with `UNTIL_DAY_END` ends at 23:59:59 IST of the activation day.
- Example: weekly pass bought Sunday 10:00, activated Sunday 12:00, valid until the following Sunday 12:00.
- `SCHOOL` requires a STUDENT eligibility check. Mock provider in `apps/api/src/modules/eligibility/eligibility-provider.ts`: institution name and declaration, no ID number stored (same pattern as free travel).
- School passes are route restricted (home stop to institution stop).
- Group rule in validation: a pass may have at most `groupSize` VALID scans on the same trip. The scanner shows "2 of 4 boarded". This replaces "pass scanned once per trip" (which is `groupSize = 1`).

**Admin:** `GET /admin/pass-types`, `POST /admin/pass-types`, `PATCH /admin/pass-types/:id` with `policy:write`, zod, rate limit, audit `pass_type.update`. Changes apply to new sales only. Screen `/admin/policies/pass-types`.

**DEMO seed values (all `isDemo = true`, shown with a "Demo price" chip until the client confirms)**

| Pass | Price | Validity | Group | Notes |
| --- | --- | --- | --- | --- |
| Day | Rs 120 | until end of day | 1 | |
| Weekly | Rs 450 | 7 days rolling | 1 | existing |
| Monthly | Rs 1,600 | 30 days rolling | 1 | existing |
| Family | Rs 1,000 | 7 days rolling | 4 | |
| School | Rs 600 | 30 days rolling | 1 | STUDENT check, route restricted |
| Annual | Rs 15,000 | 365 days rolling | 1 | |

Store in paise. These numbers are placeholders. Do not present them as real fares.

**Web:** `/passes/buy` as a simple list of pass cards (name, price, validity, who it is for, one Buy button). School flow cloned from `/free-travel`. Family pass shows "Covers up to 4 people on the same bus".

**Docs:** 05, 07 section 8, 19 seed data. Decision **D-036** (prices pending client confirmation).

**Prompt for your AI tool**

```text
P4, Dev B then Dev A. Goal: full pass catalog with activation based validity.
Read AGENTS.md, docs/07 section 8, apps/api/src/modules/passes/pass-rules.ts, apps/api/src/modules/eligibility, apps/web/app/(citizen)/passes, prompts/v2-journey-plan.md (section P4).
Backend: enum migrations first, then PassType and Pass fields, pass-rules for both validity modes, STUDENT mock eligibility, group size rule in validate.service.ts, admin pass type endpoints with audit, DEMO seed rows.
Frontend: /passes/buy cards with Demo price chip, school eligibility flow, /admin/policies/pass-types editor, scanner shows "n of groupSize".
Docs 05, 07 section 8, 19. Add D-036 saying prices are DEMO and pending client confirmation.
Tests: pass-rules per mode (DAY ends at IST midnight, weekly 7 days from activation), group limit with two parallel scans, E2E-6 buys and activates a Day pass.
```

**Done when**

- [ ] All 6 pass kinds buyable in test mode, each with correct validity after activation.
- [ ] Family pass: 4 scans on one trip valid, 5th rejected.
- [ ] Admin can edit a price; sold passes unchanged.
- [ ] D-036 logged.

---

## P5 · Door scanner and driver only mode (Dev B 1.5 days, Dev A 1.5 days)

**Goal:** a scanning machine at the bus door verifies tickets without a conductor.

**Schema**

- `enum DeviceKind { DRIVER_PHONE DOOR_SCANNER }`.
- `Device`: `userId` optional, add `kind @default(DRIVER_PHONE)`, `busId?`, `lastSeenAt?`, index `(busId, kind)`.

**Pairing and auth**

1. Ops creates a scanner: `POST /ops/devices/scanners { busId, label }` (`device:approve`, audited). Returns a 6 digit pairing code stored in Redis for 10 minutes, single use.
2. Kiosk pairs: `POST /scanner/pair { code }` (public, 5 per IP per 10 minutes). Returns a 32 byte key once. Store only the hash (same as `hashDeviceKey`).
3. `ScannerKeyGuard` checks header `x-scanner-key`: device exists, kind DOOR_SCANNER, not revoked, bound to a bus. Updates `lastSeenAt`.
4. Ops can revoke a scanner from `/ops/buses/[id]`.

**Endpoints**

- `GET /scanner/status`: bus, current RUNNING trip (from `TripAssignment` where `busId` matches, not ended), boarded counts.
- `POST /scanner/validate { qr, deviceTime, position? }`: 120 per device per minute; uses the P3 `ValidatorContext` with `kind = DOOR_SCANNER`; audited with `deviceId`.
- No manual ticket number entry on the scanner. Rotating code still required (anti screenshot).
- Never log the scanner key.

**Web**

- `/scanner/pair`: enter the code once, key saved on the device.
- `/scanner`: kiosk, full screen, wake lock, camera loop, `ResultSplash` (green VALID or red with reason, large text, sound and vibration), auto reset after 3 s, small status chips (online, trip, last sync). No nav, no account menu.
- Driver only mode: when a trip has no conductor, `/driver/trip/[id]` shows scanner health and boarded count.

**Docs:** 06, 08, 11, 12, ADR 003. Decision **D-037**.

**Prompt for your AI tool**

```text
P5, both devs. Goal: door scanner device that validates without a conductor.
Read AGENTS.md, docs/12, apps/api/src/modules/driver (device approval pattern), apps/api/src/modules/conductor, apps/web/app/conductor/scan/scanner.tsx, prompts/v2-journey-plan.md (sections P3 and P5).
Backend: DeviceKind, Device fields, pairing code in Redis, pair endpoint, ScannerKeyGuard, scanner status and validate endpoints reusing ValidatorContext, revoke, audit, rate limits.
Frontend: /scanner/pair, /scanner kiosk with ResultSplash and auto reset, scanner list and revoke in /ops/buses/[id], driver trip screen shows scanner health when no conductor.
Docs 06, 08, 11, 12, ADR 003; add D-037.
Tests: guard (missing, wrong, revoked key), pairing code single use, scanner validate HTTP test, new E2E-13 scanner spec, add /scanner to route sweep.
```

**Done when**

- [ ] A paired scanner on a bus validates a ticket on that bus's running trip; the boarding row has `validatorKind = DOOR_SCANNER` and `deviceId`.
- [ ] Revoked scanner gets 401.
- [ ] Trip without a conductor runs end to end with driver + scanner only.
- [ ] D-037 logged.

---

## P6 · Unified field shell (Dev A, 1 day)

**Goal:** driver, conductor and scanner feel like one system with different functions.

- `apps/web/components/field-shell.tsx`: add `nav` prop rendering `BottomNav`, a status strip of `StatusChip`s (online, GPS, trip, scanner), and the `NotificationBell` (move it out of the citizen layout into a shared component).
- Nav config in `apps/web/lib/roles.ts`:
  - Driver: Today, Trip, Report, Alerts.
  - Conductor: Today, Scan, Manifest, Alerts.
  - Scanner: `variant="kiosk"`, no nav.
- New `/driver/alerts` and `/conductor/alerts` reuse the notifications list.
- Same login, same language and theme switch, same status patterns everywhere.

**Done when**

- [ ] Both field apps use the same shell; nav items 56 px; keyboard and screen reader tested.
- [ ] `driver-app.spec.ts` and E2E-8 updated and passing.

---

## P7 · Driver operations: break, SOS, delay (Dev B 2 days, Dev A 1 day)

**Goal:** the driver app covers Today's duty, Bus, Route, Start, Break, Report issue, Report accident, Medical emergency (SOS), End trip, Current location. Driver reports reach passengers and ops immediately.

**Schema**

- `model TripBreak { id, tripId, driverId, startedAt, endedAt?, reason? }`.
- `IncidentType` adds `SOS`.
- `Trip` adds `reportedDelayMinutes Int?`, `reportedDelayAt DateTime?`.
- `NotificationType` adds `TRIP_DISRUPTION`, `SOS_ALERT`.

**API**

- `POST /driver/trips/:id/break/start`, `POST /driver/trips/:id/break/end`. Trip stays RUNNING; display status `ON_BREAK`.
- `POST /driver/sos { tripId, kind: MEDICAL | ACCIDENT | SECURITY, lat?, lng? }`: incident severity CRITICAL, event `incident.sos`, socket `incident:sos` to depot, district and `state:{id}` rooms, `SOS_ALERT` notification to depot managers. Audited.
- DELAY report gains `minutes` (5, 10, 15, 30, 45, 60). Sets `reportedDelayMinutes`.
- Shared `effectiveDelayMinutes(gpsDelay, reported, reportedAt, now)`: reported delay counts for 30 minutes or until GPS delay exceeds it. Used by `trip-notifications.service.ts` and `LiveTripDto` (with `delaySource: GPS | DRIVER`).
- `apps/api/src/modules/notifications/notifications.subscriber.ts`: on `incident.created` and on a reported delay, notify holders of BOOKED, ACTIVE, SCANNED tickets on that trip with `TRIP_DISRUPTION` (deterministic id, no duplicates). Example text: "Bus to Kurnool is about 15 minutes late because of traffic."

**Web**

- Driver trip screen: Break toggle, SOS `HoldButton` (3 s hold, cancel shown, confirm screen after), delay minute chips on the report screen, "My location" small map card.
- Ops layout: sticky SOS banner until a manager acknowledges it.
- Passenger: disruption shows on ticket view, bus detail, track page and as a notification.

**Shared:** `ON_BREAK` in `DisplayStatus` and `STATUS_MAP` (`packages/shared/src/status.ts`) with label and icon.

**Docs:** 05, 06, 11, 13. Decision **D-038**.

**Done when**

- [ ] Driver reports "Traffic, 15 min" and a passenger with a ticket on that trip gets a notification within seconds.
- [ ] SOS shows in ops in real time and needs acknowledgement.
- [ ] Break shows "On break" to passengers and ops.
- [ ] E2E-9 extended, D-038 logged.

---

## P8 · Stop demand analytics (Dev B 1.5 days, Dev A 1 day)

**Goal:** turn scans into government insight: which stop, which hour, how many boarded, every day.

**Schema**

```prisma
model StopHourlyBoardings {
  id              String   @id @default(cuid())
  date            DateTime @db.Date
  hour            Int                 // IST 0 to 23
  stateId         String
  districtId      String
  depotId         String
  routeId         String
  stopId          String
  boardings       Int
  ticketBoardings Int
  passBoardings   Int
  @@unique([date, hour, routeId, stopId])
  @@index([stateId, date])
  @@map("stop_hourly_boardings")
}
```

**API**

- `apps/api/src/modules/rollups/rollups.service.ts`: build from VALID scans grouped by stop and IST hour. If a scan has no `stopId`, fall back to the ticket's boarding stop. Nightly job plus a 15 minute job on the maintenance queue that recomputes today only (use the `(stopId, scannedAt)` index).
- `GET /analytics/stop-demand?from&to&districtId&routeId`: stop by hour matrix of daily averages.
- Insights (server side, plain sentences): "Kurnool RTC, 08:00 to 09:00: average 42 boarded, on 13 of 14 days. Seats supplied in that hour: 30." Rank by demand over seats.

**Web:** a "Stop demand" tab in `/gov/analytics`: heatmap grid (tokens only, soft to strong primary), a table alternative for screen readers, and top 5 insight cards.

**Seed:** `apps/api/prisma/seed-history.ts` creates scans with morning and evening peaks at a few stops.

**Docs:** 05, 06. Decision **D-039**.

**Done when**

- [ ] After seed and rollup, the tab shows clear peaks and insight sentences.
- [ ] Table alternative has the same numbers.
- [ ] D-039 logged.

---

## P9 · Citizen journey UX (Dev A 3 days, Dev B 1 day)

**Goal:** the citizen app follows the journey in section 2, simply.

**API (Dev B)**

- `GET /stops/nearby?lat&lng&limit=5`: public, 30 per IP per minute, bounding box prefilter then haversine. Never log coordinates.
- Search adds `mode=leave|arrive` and `time=HH:mm`. Arrive by uses arrival at the dropping stop.
- `TripSummaryDto` adds `live { expectedDepartureAt, delayMinutes, status }` from Redis live data.

**Web (Dev A)**

- Home: one clear search card. "Use my location" button fills From with the nearest stop (chips for the top 3). Permission denied shows a calm message, typing still works.
- Leave at / Arrive by toggle with a time picker. Default "Leave now".
- Results: scheduled time, and live time when different ("Scheduled 08:30 · Expected 08:42"), live status chip. Subscribe to `route:` socket rooms.
- Booking gets a ticket type step: Single ticket, Use my pass (if an active pass covers the service: no booking, link to the pass QR), Free travel (eligible users).
- Ticket view: a simple 3 step strip: Activate, Show QR, Boarded.

**Docs:** 06, 11. Decision **D-040**.

**Done when**

- [ ] Nearest stop works on a phone with location on and degrades well with it off.
- [ ] Arrive by returns trips arriving before the time.
- [ ] Live vs scheduled shown on results and bus detail.
- [ ] E2E-1 and E2E-2 updated, new E2E-14 "use pass instead of ticket".
- [ ] D-040 logged.

---

## P10 · Minimal rollout and hardening (Dev A, 2 days)

- Apply the minimal principles to every remaining screen (ops, gov, admin, citizen pages not touched in P9). Remove clutter: extra borders, duplicate headings, decorative icons, secondary buttons that can be links.
- Update `docs/11-screens.md` with new routes (`/scanner`, `/scanner/pair`, `/gov/state/[id]`, `/driver/alerts`, `/conductor/alerts`, `/admin/policies/pass-types`).
- Update `progress/handoff.md` (current state), package READMEs, `progress/phase-2-backlog.md` (alighting tap out, per state time zone, AirTag style low cost tracking research, offline scanner pack).

---

## Decisions to log (progress/decisions-log.md)

| Id | Decision |
| --- | --- |
| D-033 | Minimal visual refresh, token names kept, no new UI dependency, bottom nav in field apps |
| D-034 | State model, state scoped roles, `state:{id}` socket rooms, platform time zone constant, `APT-` and `APT1` prefixes stay platform wide |
| D-035 | Boarding fields on TicketScan, stop resolution rule, new scan reasons and order |
| D-036 | New pass kinds, validity modes, group size, DEMO prices pending client confirmation |
| D-037 | Door scanner pairing, key auth, driver only mode |
| D-038 | Break, SOS, reported delay, passenger disruption notifications |
| D-039 | Stop hourly boardings definition and insight rule |
| D-040 | Nearby stops, arrive by, live times, ticket type step |

---

## Verification (every phase, before the PR)

```bash
pnpm lint
pnpm typecheck
pnpm --filter @aptransit/shared test
pnpm --filter @aptransit/ui test
pnpm --filter api test
pnpm --filter web test
pnpm test:scripts
pnpm check:dashes
pnpm i18n:check
pnpm check:classes
pnpm check:endpoints
pnpm audit --prod --audit-level high
```

- Schema phases: `pnpm db:migrate` on your own Neon branch, then `pnpm db:seed`.
- E2E: `pnpm e2e -- --workers=1` on both projects (Desktop Chrome, Pixel 7), plus the route sweep (en and te, 360, 768, 1280 px) and axe.
- Check every new screen in the browser: loading, empty, error, success; keyboard only; dark mode; Telugu.

**Full journey demo after P9 (the acceptance test for this round)**

1. Citizen uses "my location", picks a destination, Arrive by 09:00.
2. Picks a bus showing live time, books a Single ticket, pays in test mode, activates.
3. Conductor scans it: VALID. Boarding row has bus, stop, conductor.
4. Second ticket scanned by the door scanner kiosk on a driver only bus: VALID. Row has `DOOR_SCANNER` and device.
5. Same ticket scanned again: ALREADY_SCANNED. Ticket scanned after its dropping stop: PAST_DESTINATION.
6. Driver reports "Traffic, 15 min": passenger gets the notification; ops sees the incident.
7. Driver presses SOS: ops banner appears.
8. Run the rollup: gov "Stop demand" tab shows the boardings.
9. Family pass: 4 scans valid, 5th rejected.
10. Switch to Telangana with `--with-tg` seed: gov state picker works.

---

## Risks

1. **Enum migrations:** split them; test every backfill on a Neon branch first.
2. **GPS stop resolution can be wrong:** checks skipped when source is NONE; log `stopSource`; watch the rejection rate for a week before making it stricter.
3. **Scanner key is a bearer secret:** hashed, bound to a bus, revocable, rate limited, never logged.
4. **Restyle breaks E2E:** keep accessible names, strings, test ids; run the route sweep on every PR.
5. **Invented pass rules:** Day, Family, School values stay DEMO until the client confirms.
6. **Socket room rename:** web and API must deploy together.
7. **Rollup load on Neon:** 15 minute job recomputes today only, indexed.
8. **Branding:** "AP TransitOS" for Telangana is a client question; add to `docs/18-open-decisions.md`.

## Open questions for the client (add to docs/18)

- Real prices, durations and eligibility for Day, Family, School and Annual passes.
- Family pass group size and whether children count.
- School pass proof (institution letter, ID card, DigiLocker later).
- Platform name if more states join.
- Door scanner hardware: Android device at the door, or a dedicated validator.
- AirTag style low cost tracking: research only, no commitment.
