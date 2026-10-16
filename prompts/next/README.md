# Next work: finish and sign off the Kurnool, seatless and staff portal round

**Tell your AI agent:** "Read `AGENTS.md`, `progress/handoff.md` and `prompts/next/README.md`, then complete the open tasks in order and tick them here."

This is the single task list for what is left after D-044 (bus classes), D-046 (seatless local travel) and the 45 Kurnool spots (branch `a/kurnool-spots`). Everything below the line "Agent tasks" can be done by an AI agent. "Human tasks" need a person.

## Context in 10 lines

- Local buses (Pallevelugu, Ultra Pallevelugu, City Ordinary) and any trip of 50 km or less are seatless: `packages/shared/src/seatless.ts`. Reserved long trips still pick seats.
- Fares by age: adult, child (under 12, 50 percent), senior (60 and over, 50 percent assumed): `packages/shared/src/fare.ts`.
- 45 Kurnool spots are stops with city lines `KCM-01`, `KCC-01`, `KHL-01`, `KCL-01`, `KOT-01`: `apps/api/prisma/seed-data.ts`, test `apps/api/test/seed-local.test.ts`.
- The map picker opens on Kurnool and frames only A and B: `apps/web/app/(citizen)/map-picker.tsx`, `packages/ui/src/components/map-view.tsx`.
- The sign in page links to the driver, conductor, depot, government and admin portals: `apps/web/app/(auth)/login/login-form.tsx`, test `apps/web/e2e/staff-portals.spec.ts`.
- Decisions: D-044, D-046 in `progress/decisions-log.md`. Values marked **(A)** are assumptions the owner has not confirmed.
- Docs in `docs/` are locked. Do not edit them. Write questions in `progress/decisions-log.md`.

## Agent tasks (in order)

1. **Review and merge state.** (Checked 2026-10-16: PR #15 is merged into upstream `main`, which holds all three branches; this branch only adds the Kurnool data check.) Check the open PRs for `a/bus-classes`, `a/local-seatless` and `a/kurnool-spots`. The Kurnool branch already contains the other two. Merge order is bus-classes, local-seatless, kurnool-spots. If upstream `main` moved, merge it in and rerun the checks below.
2. **Run the seeded E2E suite** (see "Run locally" in `progress/handoff.md`, Windows ports 15432 and 6380). Fix real failures. Specs to watch: `staff-portals.spec.ts`, `v3-shell.spec.ts`, `v3-map-home.spec.ts`, the booking specs. The dev OTP limit is 10 per IP per hour: restart `scripts/dev-redis.mjs` between runs.
3. **Write the missing E2E specs:**
   - Group booking on a long reserved trip (adults, child, senior, seats and names required).
   - Zone pass purchase and child card purchase.
   - Conductor scans a child ticket (`CHILD_BOARDED`).
   - Seatless local booking end to end (ages only, no seat shown on the ticket).
4. **Route sweep and axe** (specs already list `/terms` and `/bus-types` in `route-sweep.spec.ts` and `a11y.spec.ts`; they have not been run, no seeded stack in the cloud session) for `/terms` and `/bus-types` (added, never run). Add them to the sweep in `apps/web/e2e`.
5. **Kurnool data check. DONE** (`seed-local.test.ts`, passes). Open the map in a real browser if you have one, otherwise assert in a test that every one of the 45 stops has a unique code, a Telugu name, coordinates inside Kurnool and is on at least one city line. Do not change OpenStreetMap positions without a source.
6. **Docs proposal, not an edit. DONE** (D-047 in `progress/decisions-log.md`). Write one entry in `progress/decisions-log.md` (next free id) that lists exactly which locked docs (05, 06, 07, 11, 18, 19) need changes for D-044 and D-046, with the proposed text. The other dev must agree before the docs change.
7. **Housekeeping. DONE on 2026-10-16** (lint, typecheck, test, i18n:check, check:dashes passed; build passed). `pnpm lint`, `pnpm typecheck`, `pnpm test` (use `TURBO_CONCURRENCY=1` on the Windows laptop), `pnpm i18n:check`, `pnpm check:dashes`, `pnpm build`. Then update `progress/handoff.md` (Current state), `progress/daily-log.md` (end of day report) and the package READMEs if a pattern changed.

Rules that bite here: no em or en dash anywhere, every string in both `en.json` and `te.json`, tokens only, no new dependency, titles only for commits and no AI attribution lines (see `AGENTS.md`).

## Human tasks

- [ ] Owner confirms the **(A)** values: senior percent (now 50), local route limit (now 130 km), reservation fee on seatless tickets (now charged), seatless limit 50 km. Record answers in `docs/18-open-decisions.md` through the other dev and under D-046.
- [ ] Native Telugu review of the 45 new Kurnool stop names and the new `te.json` keys (staff portal links on the sign in page, map picker).
- [ ] Real browser check of the map on desktop Chrome and an Android phone: tiles show, A and B pins frame correctly, "Use my location" picks a sensible stop. Headless Chromium cannot paint tiles.
- [ ] Google OAuth client and env vars (see `prompts/v3/human-tasks.md`, section 1).
- [ ] QR phone field test, TalkBack and NVDA passes (see `prompts/v3/human-tasks.md`, sections 3 and 5).
- [ ] The other dev reviews the shared contract changes (`CreateBookingPassengerInput`, `FareDto.seatless`, `groupFare`, bus classes).

## Still open from earlier rounds

Staging (Render, Vercel, Neon, Upstash), load tests, restore drill, Lighthouse, manual QA on real phones and the v0.2.0 and v1.0.0-demo tags: see "Not done yet" in `progress/handoff.md` and `progress/phase-2-backlog.md`.
