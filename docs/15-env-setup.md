# 15 · Environment setup

**Status: LOCKED.** Decision: [ADR 002](adr/002-cloud-data.md). No Docker needed.

## Accounts (Day 1 morning, Dev A creates, shares access with Dev B)

| Service | What to create | Free tier notes |
| --- | --- | --- |
| GitHub | Repo https://github.com/syedmukheeth/APTransit, both devs as admins | |
| Neon | Project `aptransit`, region Singapore (closest to AP). Branches: `main` (staging), `dev-a`, `dev-b`, `test` | Branching gives each dev an isolated copy of the schema and seed |
| Upstash | One Redis database per dev (`aptransit-dev-a`, `aptransit-dev-b`) and one for staging. Region Mumbai or Singapore, TLS on | 500K commands per month each. See BullMQ settings below |
| Razorpay | Account in **test mode** only. Generate test Key Id and Secret. Webhook secret set on Day 6 | No KYC needed for test mode |
| Resend | API key. Domain verification optional for dev (use `onboarding@resend.dev` as sender) | 100 emails per day |
| Vercel | Import repo on Day 10, root `apps/web` | Hobby |
| Render | Two services on Day 10: `aptransit-api` (web service), `aptransit-worker` (background worker) | Free web services sleep after 15 min idle. Warm up before demos |

Store every credential in a shared password manager, never in chat or the repo.

## Environment variables

`apps/api/.env` (Dev B owns `.env.example`):

```bash
NODE_ENV=development
APP_ENV=development                                                   # development, staging or production. Dev only features need a non production APP_ENV
PORT=4000
WEB_ORIGIN=http://localhost:3000
GOOGLE_CLIENT_ID=                                                    # D-043 optional. OAuth web client id (ends .apps.googleusercontent.com). Empty hides Google sign in
DATABASE_URL=postgresql://...-pooler.../aptransit?sslmode=require     # Neon pooled, used by the app
DIRECT_URL=postgresql://.../aptransit?sslmode=require                 # Neon direct, used by prisma migrate
REDIS_URL=rediss://default:...@...upstash.io:6379
JWT_SECRET=change-me-64-chars
OTP_PEPPER=change-me-32-chars
OTP_DEV_ECHO=1                                                        # prints OTP to the API log, never on staging
QR_SIGNING_PRIVATE_KEY=base64-pem
QR_SIGNING_KEY_ID=k1
QR_SECRET_KEY=base64-32-bytes
RAZORPAY_KEY_ID=rzp_test_xxx
RAZORPAY_KEY_SECRET=xxx
RAZORPAY_WEBHOOK_SECRET=xxx
RESEND_API_KEY=re_xxx
EMAIL_FROM="AP TransitOS <onboarding@resend.dev>"
PAYMENTS_FAKE=0                                                       # 1 enables POST /payments/test/complete (dev and CI only, never staging)
WORKER=0                                                              # 1 runs BullMQ consumers instead of HTTP
BULLMQ_DRAIN_DELAY_SEC=60
TZ_DISPLAY=Asia/Kolkata
```

`apps/web/.env.local` (Dev A owns `.env.example`):

```bash
API_URL=http://localhost:4000                # used by the Next rewrite, server side only
NEXT_PUBLIC_WS_URL=http://localhost:4000
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_xxx
NEXT_PUBLIC_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
NEXT_PUBLIC_APP_ENV=development
NEXT_PUBLIC_PAYMENTS_FAKE=0                  # 1 skips the Razorpay popup and uses POST /payments/test/complete (dev and CI only)
```

Generate keys once:

```bash
node -e "const {generateKeyPairSync}=require('crypto');const {privateKey}=generateKeyPairSync('ed25519');console.log(Buffer.from(privateKey.export({type:'pkcs8',format:'pem'})).toString('base64'))"
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Google sign in setup (D-043)

1. Google Cloud console, APIs and services, Credentials, Create OAuth client ID, type Web application.
2. Authorised JavaScript origins: `http://localhost:3000` and the Vercel staging and production origins. No redirect URI is needed (popup mode).
3. Put the client id in `apps/api/.env` as `GOOGLE_CLIENT_ID` and in `apps/web/.env.local` as `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (same value). Restart both. No client secret is used.

## Upstash and BullMQ budget

BullMQ polls Redis while idle. With the default `drainDelay` of 5 s one idle worker uses about 518K commands a month, more than the free tier. So:

- Only the worker process (`WORKER=1`) creates BullMQ `Worker` instances. The API only adds jobs.
- `drainDelay: 60` on every worker, at most 4 queues: `notifications`, `expiry`, `rollups`, `maintenance`.
- Repeatable jobs instead of many delayed jobs where possible.
- Locally, run the worker only when working on jobs (`pnpm dev:worker`).
- If a database still nears its limit, switch that database to Upstash pay as you go (cost is a few rupees for this project) and log it in the decisions log.

## Prisma with Neon (Prisma 7)

- `apps/api/prisma.config.ts` loads `.env` with `process.loadEnvFile` and sets `datasource.url` to `process.env.DIRECT_URL` for the CLI (decision D-004).
- `schema.prisma` datasource has no `url`.
- `PrismaService` builds the client with `new PrismaPg({ connectionString: process.env.DATABASE_URL })`.
- Neon sleeps after idle. First query after sleep takes about 1 s. Fine for dev; warm staging before demos.

## First run (after Day 1)

```bash
corepack enable
pnpm install
cp apps/api/.env.example apps/api/.env          # fill values
cp apps/web/.env.example apps/web/.env.local    # fill values
pnpm db:migrate
pnpm db:seed
pnpm dev                                        # web :3000, api :4000
```

Open http://localhost:3000, log in as `citizen@aptransit.test`, read the OTP from the API log.

## Windows notes (both devs use Windows)

- Use Git Bash or PowerShell 7. Keep the repo path short with no spaces (for example `E:\APTransit`).
- `git config core.autocrlf input` is fine; `.gitattributes` sets `* text=auto eol=lf`.
- If the camera does not open on `localhost` in Chrome, use `http://localhost` (not the LAN IP). Phones need HTTPS: use the staging URL or `pnpm dev:https` (Next experimental HTTPS) to test camera and GPS on a real phone over LAN.
