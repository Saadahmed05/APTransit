# apps/api

NestJS 11 API and background worker for AP TransitOS. Owner: Dev B. Contract: `docs/06-api-contract.md`. Current state and gotchas: `progress/handoff.md`.

## Run

```bash
cp .env.example .env            # fill real values (docs/15). Never commit .env
pnpm --filter api generate      # Prisma client into src/generated/prisma (Turbo also does this)
pnpm db:migrate                 # from the repo root, on your own Neon branch
pnpm dev                        # from the repo root: web :3000 and api :4000
pnpm dev:worker                 # worker process (WORKER=1)
```

Check it: `http://localhost:4000/api/v1/health` answers 200 with `db: "ok"` and `redis: "ok"`. 503 means one of them is unreachable (check `.env`).

Without Neon yet, a local PGlite socket server plus `node scripts/dev-redis.mjs` is enough for search and E2E-1 (data in gitignored `.local/`, Redis on 127.0.0.1:6380). Point `DATABASE_URL` and `DIRECT_URL` at PGlite, then `pnpm db:deploy` and `pnpm db:seed`. The worker still needs real Redis (Upstash) for BullMQ.

## Scripts

| Script | What it does |
| --- | --- |
| `generate` | `prisma generate` (update notice hidden) |
| `build` | `nest build` into `dist/` (`dist/main.js`, `dist/worker.js`) |
| `dev`, `dev:worker` | watch mode for the API or the worker |
| `start`, `start:worker` | run the build |
| `typecheck`, `lint`, `test` | tsc, eslint, vitest |
| `db:migrate` | `prisma migrate dev` |
| `db:deploy` | `prisma migrate deploy` (Render build, docs/17) |
| `db:studio` | Prisma Studio |
| `db:seed` | deterministic AP demo data (`prisma/seed.ts`, docs/19) |
| `db:reset` | wipes and reseeds; refuses the Neon `main` branch and production |

Run Prisma directly with `pnpm --filter api exec prisma <command>` (not `pnpm --filter api prisma`).

## Layout

```
src/
  main.ts                 HTTP entry: NestFactory + configureHttpApp + listen on 0.0.0.0:PORT
  worker.ts               worker entry, requires WORKER=1, BullMQ consumers from Day 5
  http-app.ts             configureHttpApp(app): logger, trust proxy, helmet, CORS, 100 kb JSON, prefix api/v1
  app.module.ts           Config, Logger, Prisma, Redis, Throttler, feature modules, global filter, guards, audit interceptor
  config/env.ts           EnvSchema + validateEnv: the only list of env vars
  common/
    errors/app-error.ts   AppError(code, message, details?) with status from ERROR_HTTP_STATUS
    filters/all-exceptions.filter.ts   every error becomes the docs/06 shape, 5xx hide details
    decorators/           @Public(), @Can(permission), @CurrentUser(), @Audit(action)
    guards/jwt-auth.guard.ts           global: Bearer JWT, sets req.user, checks @Can
    guards/app-throttler.guard.ts      global: 120 per user or IP per minute, @Throttle to tighten
    interceptors/audit.interceptor.ts  writes the audit row for routes marked @Audit(action)
    pipes/zod-validation.pipe.ts       new ZodValidationPipe(Schema) on @Body, @Query, @Param
    services/             ScopeService (depot, district checks), RateLimitService (OTP target limits), redis-window,
                          TtlCache (small per process cache with TTL and size cap)
    throttler/            Redis storage for @nestjs/throttler (one Lua command per hit, fails open)
    logger.ts             pino params: request ids, redaction list, health requests not logged
  prisma/                 PrismaService (Prisma 7, pg adapter, pooled URL, lazy connect)
  redis/                  RedisService (ioredis, lazy connect, throttled error logs)
  modules/<area>/         one folder per feature module (health is the reference)
  modules/network/        public places, districts, bus stands, routes, timetable, search (Day 4).
                          NetworkRepository holds every query (search is one raw SQL round trip plus one
                          seat count groupBy), NetworkService holds the rules, trip-summary.ts builds TripSummaryDto
  generated/prisma/       generated client, git ignored
prisma/
  schema.prisma           mirrors docs/05 (only settings so far)
  migrations/             committed SQL migrations
prisma.config.ts          Prisma 7 CLI config: loads .env with process.loadEnvFile, uses DIRECT_URL
test/
  setup-env.ts            fills process.env before any test imports AppModule
  test-env.ts             complete fake env (add every new env var here)
  http.test.ts            full HTTP pipeline with fake Prisma and Redis
  health.int.test.ts      real Neon test branch, runs only with TEST_DATABASE_URL
  network-fixture.ts      in memory docs/19 network with the NetworkRepository contract (no database needed)
  network.test.ts         network and search endpoints over HTTP with the fixture
  network.int.test.ts     the real search SQL on a seeded Neon test branch
```

## Adding a feature module

1. Schemas first: `packages/shared/src/schemas/<area>.ts` (`<Thing>Input`, `<Thing>Dto`, `<Thing>Query`), exported from `packages/shared/src/index.ts`.
2. `src/modules/<area>/<area>.module.ts`, `.controller.ts`, `.service.ts`, `.service.test.ts`. Import the module in `app.module.ts`.
3. Controllers stay thin: validate, call the service, return a Dto. Business rules live in services or dedicated rule files (docs/07 names them).
4. Fail with `throw new AppError("CODE", "Plain message", { detail })`. Codes only from `packages/shared/src/errors.ts`.
5. Inject with value imports (`import { PrismaService } from "../../prisma/prisma.service"`), never `import type`.
6. Every mutating endpoint: validation, auth, permission, rate limit and audit where docs/12 lists them. See "Auth, limits and audit" below.

Minimal controller, copied from health:

```ts
@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get()
  @Header("Cache-Control", "no-store")
  async get(@Res({ passthrough: true }) res: Response): Promise<HealthDto> {
    const report = await this.health.check();
    if (report.status !== "ok") res.status(503);
    return report;
  }
}
```

## Auth, limits and audit

| Need | Use |
| --- | --- |
| No login | `@Public()` on the handler. A valid Bearer token still fills `req.user` |
| Permission | `@Can("ticket:validate")` (names from `packages/shared/src/permissions.ts`), 403 `FORBIDDEN` |
| Scope | inject `ScopeService`, call `assertDepotAccess(user, depotId)` or `assertDistrictAccess` in the service |
| Who is calling | `@CurrentUser() user: AuthenticatedUser` (null on public routes without a token) |
| Tighter rate limit | `@Throttle({ default: { limit: 60, ttl: 60_000 } })` from `@nestjs/throttler`. Keyed by user id when logged in, else IP |
| No default limit | `@SkipThrottle()` (health, and auth routes that use `RateLimitService` target limits) |
| Audit row | `@Audit("booking.create")`: written after success, entity id from the response `id` or `:id`. For before and after snapshots call `AuditService.log` |

Rate limits fail open when Redis is down (a cache outage never blocks traffic). OTP attempts are still capped per code in the database.

Seat holds: only through `modules/bookings/seat-holds.ts` (`holdSeats`, `releaseSeats`). Each is one Lua script, so a hold is all or nothing and a release never frees another booking's seat (D-019). Queue job ids must not contain ":" (BullMQ rejects them).

Payments: provider behind `PAYMENT_PROVIDER` (`RazorpayProvider`; tests override it with `FakePaymentProvider`). Tickets are created only in `BookingConfirmationService.confirmBooking`, which is idempotent (D-020). Domain events: inject `DomainEventsService` and `on("booking.confirmed", ...)`. Idempotency-Key: `common/services/idempotency.ts`. Secrets at rest: `common/crypto/secret-box.ts` (AES 256 GCM, `QR_SECRET_KEY`). HTTP tests: `test/fake-redis.ts` knows the Lua scripts.

## Tests

- Vitest with SWC (decorators and metadata). `pnpm --filter api test`.
- `test/setup-env.ts` runs first and loads `testEnv()`. `TEST_DATABASE_URL` and `TEST_REDIS_URL`, when set, replace the fake database and Redis URLs.
- HTTP tests: build the module with `Test.createTestingModule({ imports: [AppModule] })`, override `PrismaService` and `RedisService` with small fakes when the test is not about them, call `configureHttpApp(app)`, then `supertest`.
- Integration tests that need real services use `describe.skipIf(!process.env.TEST_DATABASE_URL)`.
- Services that read a lot of data put the queries in a `<area>.repository.ts` class. HTTP tests then override the repository with an in memory fake (`test/network-fixture.ts`), and a `.int.test.ts` covers the real SQL.
- Raw SQL: Prisma maps camelCase fields to quoted camelCase columns (`t."scheduledDepartureAt"`), tables use the `@@map` names. Compare `serviceDate` with `CAST(${date} AS date)` and read timestamps as `EXTRACT(EPOCH FROM ...)`, so no time zone guessing happens in the driver.

## Errors and logs

- Response shape: `{ error: { code, message, details?, requestId } }`. The web shows `t("errors." + code)`, never `message`.
- Every response carries `x-request-id`. Quote it when reporting a bug.
- Never log OTPs, tokens, cookies, signatures or full phone numbers. Add new sensitive field names to `REDACT_PATHS` in `src/common/logger.ts`.
