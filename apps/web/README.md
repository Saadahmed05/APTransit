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
| `e2e` | Playwright E2E-1 (starts API and web unless they are already running) |
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
