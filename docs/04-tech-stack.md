# 04 · Tech stack

**Status: LOCKED.** Source: plan sec 55. Only libraries listed here may be installed. Need another one? Log it in `progress/decisions-log.md` first.

## Runtime and tooling

| Tool | Version rule | Why |
| --- | --- | --- |
| Node.js | 22 LTS | Both devs already have 22.20 |
| pnpm | 11.x, pinned in root `packageManager` (decision D-001) | Fast, strict workspaces, blocks untrusted install scripts |
| Turborepo | latest 2.x | Task caching, `pnpm dev` runs web and api together |
| TypeScript | latest stable 5.x, `strict: true` | One language end to end |
| ESLint 9 (flat config) + typescript-eslint + eslint-plugin-jsx-a11y | latest | Catch bugs and a11y issues early |
| Prettier | latest | One format, no debates |
| tsx | latest | Run TS scripts (seed, simulator) |

## Web (`apps/web`, Dev A)

| Library | Purpose |
| --- | --- |
| next 16 (App Router, Turbopack) | Framework, server components, routing |
| react 19, react-dom 19 | UI |
| tailwindcss 4 + @tailwindcss/postcss | Styling from tokens (`@theme`) |
| shadcn/ui (copied into `packages/ui`), @radix-ui/* | Accessible primitives, restyled to our tokens |
| class-variance-authority, clsx, tailwind-merge | Component variants |
| lucide-react | Icons (one icon set only) |
| @tanstack/react-query | Server state, caching, retries |
| react-hook-form + @hookform/resolvers | Forms with zod validation |
| next-intl | English and Telugu |
| maplibre-gl + react-map-gl (maplibre entry) | Maps, see [ADR 004](adr/004-maps-maplibre.md) |
| recharts | Charts in ops and gov |
| qrcode | Render ticket QR as SVG |
| qr-scanner | Fast camera QR scanning in a web worker |
| socket.io-client | Live updates |
| sonner | Toasts (shadcn default) |
| vaul | Bottom sheets on mobile (shadcn Drawer) |
| date-fns 4 + @date-fns/tz | Dates in `Asia/Kolkata` |

PWA: follow the official Next.js PWA guide. `app/manifest.ts` plus a hand written `public/sw.js`. No PWA plugin.

Fonts via `next/font/google`: **Inter** (Latin) and **Noto Sans Telugu** (Telugu). Self hosted by Next, no runtime Google calls.

## API (`apps/api`, Dev B)

| Library | Purpose |
| --- | --- |
| @nestjs/core, common, platform-express 11 | Framework |
| @nestjs/config | Env loading, validated by a zod schema at boot |
| @nestjs/throttler + Redis storage | Rate limits |
| @nestjs/websockets, @nestjs/platform-socket.io, socket.io 4 | Realtime |
| prisma 7, @prisma/client, @prisma/adapter-pg, pg | Database, see [ADR 002](adr/002-cloud-data.md) |
| ioredis | Redis client (TCP, TLS to Upstash) |
| bullmq 5 + @nestjs/bullmq | Background jobs |
| zod | Validation via a small custom `ZodValidationPipe` in `common/` |
| jose | JWT sign and verify |
| Node `crypto` (built in) | Ed25519 QR signing, HMAC for Razorpay and rotating codes |
| @paralleldrive/cuid2 | Public ids |
| razorpay | Payments SDK (test mode) |
| resend | Email OTP and notifications |
| helmet | Security headers |
| nestjs-pino + pino | Structured JSON logs |
| @sentry/node (optional, Day 18) | Error tracking on free tier |

## Shared (`packages/shared`)

zod only. No runtime dependency on React or Nest.

## Testing

| Library | Where |
| --- | --- |
| vitest + @vitest/coverage-v8 | All unit tests (web, api, shared) |
| unplugin-swc | Lets vitest compile Nest decorators |
| supertest | API integration tests |
| @playwright/test + @axe-core/playwright | End to end and accessibility |
| autocannon | Load test for validate and search (Day 17) |

## Banned

| Library | Use instead |
| --- | --- |
| moment, dayjs, luxon | date-fns + @date-fns/tz |
| lodash, underscore | Native JS |
| axios | fetch (web: small wrapper in `lib/api.ts`) |
| MUI, Chakra, Ant Design, Bootstrap | packages/ui (shadcn + tokens) |
| styled-components, emotion, CSS modules | Tailwind with tokens |
| Redux, MobX, Zustand | React Query for server state, React state for UI state |
| Google Maps JS SDK, Leaflet | MapLibre |
| next-pwa, serwist | Manual service worker |
| bcrypt for OTP | SHA 256 with server pepper (OTP lives 5 minutes) |
| Any second icon set | lucide-react |

## Version record (filled once on Day 1 by Dev B, then locked)

Newer majors exist for some tools (NestJS 12, TypeScript 7, ESLint 10, Vitest 5, Prisma 8 release candidate). We stay on the majors above for the 20 days (decision D-003).

| Package | Exact version |
| --- | --- |
| node | 22.20.0 (engines: 22.12 or newer) |
| pnpm | 11.10.0 |
| turbo | 2.11.3 |
| typescript | 5.9.3 |
| zod | 4.6.5 |
| @nestjs/core, common, platform-express, testing | 11.2.6 |
| @nestjs/config | 4.0.4 |
| @nestjs/cli | 11.0.24 |
| prisma, @prisma/client, @prisma/adapter-pg | 7.10.0 |
| ioredis | 5.11.1 |
| nestjs-pino / pino / pino-http | 5.2.0 / 10.3.1 / 11.0.0 |
| helmet | 8.3.0 |
| vitest | 4.1.11 |
| unplugin-swc / @swc/core | 2.0.0 / 1.16.2 |
| eslint / typescript-eslint | 9.39.5 / 8.70.1 |
| prettier | 3.9.9 |
| next / eslint-config-next | 16.3.8 / 16.3.8 |
| react, react-dom | 19.3.0 |
| tailwindcss, @tailwindcss/postcss | 4.3.3 |
| clsx / tailwind-merge | 2.1.1 / 3.7.0 |
| eslint-plugin-jsx-a11y | 6.10.2 |
| socket.io | installed on Day 11 |
| bullmq | installed on Day 5 |
| next-intl | installed on Day 3 |
| maplibre-gl | installed on Day 12 |
