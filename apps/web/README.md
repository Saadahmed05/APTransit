# apps/web

Next.js 16 App Router app for every AP TransitOS surface: citizen PWA, driver, conductor, ops, gov and admin. Owner: Dev A. Screens: `docs/11-screens.md`. Design: `docs/09-design-system.md`. Current state and gotchas: `progress/handoff.md`.

## Run

```bash
cp .env.example .env.local      # docs/15
pnpm dev                        # from the repo root: web on http://localhost:3000, api on :4000
```

## Scripts

| Script | What it does |
| --- | --- |
| `dev`, `build`, `start` | Next on port 3000 (Turbopack) |
| `lint` | ESLint: Next core web vitals, Next TypeScript, full jsx-a11y recommended, our shared rules |
| `test` | Vitest for `lib/` and `proxy.ts` |
| `e2e` | Playwright E2E-1. Locally start API and web first; in CI (`CI=1`) Playwright starts the built apps. First run: `pnpm exec playwright install chromium` |
| `typecheck` | `next typegen` (route types) then `tsc --noEmit` |

## How it is wired

- `app/globals.css`: `@import "tailwindcss"`, then `@import "@aptransit/ui/tokens.css"`, then `@source` for `packages/ui/src` so Tailwind sees component classes. Class reference: `packages/ui/README.md`.
- `app/layout.tsx`: Inter (`--font-inter`) and Noto Sans Telugu (`--font-telugu`) via `next/font/google`, self hosted at build time. Title template `"%s · AP TransitOS"` (from i18n). `lang`, `data-locale` and `data-theme` come from the `locale` and `theme` cookies (`i18n/request.ts`, `lib/preferences.ts`).
- `next.config.ts`:
  - rewrites `/api/v1/*` to `API_URL`, so the browser always calls the web origin and the refresh cookie stays first party (docs/06);
  - `transpilePackages: ["@aptransit/ui"]` because ui ships source;
  - `agentRules: false` so `next dev` stops writing its own AGENTS.md and CLAUDE.md here (decision D-007);
  - `poweredByHeader: false`.
- `@aptransit/shared` is imported from its compiled `dist/` (Turbo builds it first).

- Shells: `(citizen)/layout.tsx` (top bar, `CitizenTopNav`, `CitizenBottomNav`), `components/field-shell.tsx` (driver, conductor), `components/management-shell.tsx` (ops, gov, admin). Landing pages use `components/coming-soon.tsx` until their real screen ships.
- Nested layout titles use `title: { absolute: "<Area> · AP TransitOS", template: "%s · AP TransitOS" }`. A plain `default` gets the root template again ("X · AP TransitOS · AP TransitOS").

## Data and session (Day 4)

- **Calling the API:** always `api(path, { schema, query, method, body })` from `lib/api.ts`. It parses the docs/06 error shape into `ApiError` (`code`, `status`, `details`, `requestId`, `retryAfterSec`), validates the response with the shared Dto, and on 401 refreshes once (single flight in the tab, Web Lock across tabs) and retries once. Public data passes `redirectOn401: false`.
- **Errors on screen:** `t(errorKey(error, (k) => t.has(k)))` gives `errors.<CODE>`, `errors.NETWORK` or `errors.INTERNAL`.
- **Session:** `components/providers.tsx` (React Query + `AuthProvider` + Toaster) wraps everything in the root layout. The access token lives in `lib/session.ts` (memory only). `useAuth()` gives `status`, `login`, `logout`; `useMe()` gives the user. The root layout passes `hasSession` (the httpOnly `apt_session` marker, D-016) so anonymous visitors never trigger a refresh call.
- **Guards:** `proxy.ts` redirects the docs/08 login routes to `/login?next=` when the marker is missing. Pages wrap content in `RequireAuth`, staff layouts in `RequirePermission anyOf={[...]}` (403 state). `lib/roles.ts` has the role homes and `safeNextPath` (never redirect off site).
- **Query keys:** `lib/query-keys.ts`.
- **Tests:** `pnpm --filter web test` (vitest, node) for `lib/` and `proxy.ts`. Components with behaviour live in `packages/ui` with their tests.

## Rules that bite

- **Next.js 16 changed APIs.** When unsure, read the bundled guides in `node_modules/next/dist/docs/` before writing code (AGENTS.md rule 12).
- **Tokens only.** No hex, no `bg-white`, no `text-lg` (they do not exist). Use `packages/ui` classes.
- **No hardcoded strings** from Day 3 on (next-intl keys in `messages/en.json` and `messages/te.json`). The Day 1 token page is the only exception.
- **No `setState` directly in `useEffect`.** The React Compiler lint rule rejects it. Read browser state with `useSyncExternalStore`, change things in event handlers. Example: `app/_token-check/token-check.tsx`.
- **Server to client props must be plain data.** A server layout cannot pass a component function (`icon: Bus`) to a client component. Pass an element (`icon: <Bus />`) or a string key.
- **`packages/ui` components with event handlers are `"use client"`** (Button, IconButton, ErrorState, Radix wrappers). Keep EmptyState, Card, Field and inputs free of it: server pages pass them icon components.
- **Buttons that navigate:** `<Button asChild><Link href="/">...</Link></Button>`. Never `<Link><Button/></Link>` (a button inside a link is invalid HTML).
- **Cookies from components:** write them through `lib/preferences.ts`; the React Compiler lint rejects `document.cookie = ...` inside a component.
- **Next 16 renamed `middleware.ts` to `proxy.ts`** (function `proxy`). Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` before the Day 4 route guard.
- **Private folders** start with `_` (`app/_token-check`), so they never become routes.
- **Telugu overflow:** check every screen at 360 px in Telugu. In flex and grid rows give text cells `min-w-0`.
- Every screen needs loading, empty, error and success states (docs/11), and a single `h1`.

## Folder plan (docs/03)

```
app/(citizen)/   app/(auth)/login/   app/driver/   app/conductor/   app/ops/   app/gov/   app/admin/   app/design/
components/      app level components composed from packages/ui
lib/             api client, auth, query keys, socket client, formatters
messages/        en.json, te.json (Day 3)
public/          manifest icons, static files
```

## Booking flow (Day 6)

`/book/[tripId]` (seats), `/details` (passengers), `/review?booking=` (hold timer, Pay). State shared across the steps lives in `lib/booking-draft.ts` (session storage per trip). Forms use react-hook-form with the shared zod schema. Send `Idempotency-Key` with `api(path, { headers })`.

## Payments and tickets (Day 7)

`lib/payments.ts` `usePayment().pay(...)` opens Razorpay checkout (or, with `NEXT_PUBLIC_PAYMENTS_FAKE=1`, calls `/payments/test/complete`). `/book/done/[bookingId]` and `/tickets` use `components/ticket-summary-card.tsx`. Route phrases use `common.routeFromTo` so Telugu word order is right. E2E-2 needs `E2E_PAYMENTS_FAKE=1`.

## Days 8 to 11

- Ticket page `/tickets/[id]`: `components/live-qr.tsx` (Web Crypto code from `lib/qr-code.ts`, `components/qr-svg.tsx` from `qrcode`), offline copy in `lib/offline-tickets.ts` (IndexedDB, cleared on logout).
- Browser state hooks: `lib/use-browser-state.ts` (`useNow`, `useOnline`). Keep `useSyncExternalStore` subscribe functions stable.
- Passes, free travel and updates: `usePayment().pay({ passId })`, `Countdown` from packages/ui, `components/notification-bell.tsx`.
- PWA: `app/manifest.ts`, `public/sw.js` (read its header before changing caching), `components/service-worker.tsx`, `/offline`, `lib/install-prompt.ts`.
- E2E: use `e2e/fixtures.ts` (`citizen`, `citizen2`) and `e2e/helpers.ts` (`bookAndPay`, `pickTrip`); run with `E2E_PAYMENTS_FAKE=1` and `--workers=1` locally.
- Driver app: `lib/use-gps-sender.ts`, `lib/gps-buffer.ts`, `lib/use-wake-lock.ts`, `lib/driver-device.ts` (device key in localStorage), `lib/driver-today.ts`.

## Day 12 citizen live tracking

/track supports upcoming tickets, owned ticket codes and route search. /track/[tripId] loads the map dynamically, shows accessible route progress and subscribes to the trip room. lib/socket.ts owns one client per tab, refreshes auth and restores subscriptions. lib/use-live-trip.ts falls back to REST every 15 s after a 10 s disconnection. LiveEvents updates notification and ticket queries; the driver trip uses the same live hook. All tracking copy lives in both message files. E2E-7 exercises movement, incident, offline fallback and completion on desktop and mobile.

## Day 13 conductor app

/conductor shows the assigned route, departure and live counts. /conductor/scan uses qr-scanner with the back camera, ten scans per second, a permission explanation, torch detection and manual entry. Manual entry needs the ticket number and current live code shown on the passenger ticket. Result overlays announce every reason, show passenger fields for valid tickets, provide haptics and optional sound, and resume after three seconds or a tap. /conductor/manifest shows checked and pending seats. All copy is translated in English and Telugu.

E2E-8 injects decoded text through apt:test-scan when NEXT_PUBLIC_PAYMENTS_FAKE=1 was set at build time. It follows the regular validation request path; the flag is disabled in a normal production build. Browser result tests mock API responses, while API integration tests separately verify real validation rules and race protection. Physical phone/HTTPS scan latency remains a release check.

## Day 14

Day 14 adds /ops, /ops/buses, /ops/trips and /ops/incidents with live query updates, a depot URL scope, fleet creation, assignment and incident acknowledgement/resolution. Ops tables use shared DataTable and KPIs use KpiTile. Browser coverage lives in e2e/operations.spec.ts. MapLibre stays behind the lazy UI map-view import.
