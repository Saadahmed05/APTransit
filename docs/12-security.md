# 12 · Security

**Status: LOCKED.** Source: plan sec 50, 51, 52, 62, 105. Owner: Dev B, with Dev A owning the web items. Baseline: OWASP Top 10 and OWASP ASVS level 1.

## Checklist by OWASP area

| Area | What we do | Where | Day |
| --- | --- | --- | --- |
| A01 Broken access control | Global `JwtAuthGuard` (opt out with `@Public()`), `@Can(permission)` guard, scope check (depot, district) in every service method that loads staff data, ownership check for tickets, passes, bookings | `apps/api/src/common/guards` | 3 |
| A02 Crypto failures | TLS everywhere (Neon, Upstash, Render, Vercel). OTP and refresh tokens stored as SHA 256 hashes. `qrSecret` encrypted with AES 256 GCM. Ed25519 for QR. Secrets only in env | `common/crypto.ts` | 3, 7 |
| A03 Injection | Prisma only, no raw SQL except reviewed `$queryRaw` with tagged templates. zod on every input. React escapes output, no `dangerouslySetInnerHTML` | | all |
| A04 Insecure design | Business rules in one place ([07](07-ticket-and-pass-rules.md)) with tests. Server decides payment, status, eligibility, fare | | all |
| A05 Misconfiguration | `helmet`, strict CORS (only the web origin), no stack traces in prod responses, `x-powered-by` off, env validated by zod at boot (API refuses to start with a missing secret) | `main.ts` | 1, 17 |
| A06 Vulnerable components | `pnpm audit --prod` in CI (fail on high), Dependabot or Renovate on GitHub | CI | 1 |
| A07 Auth failures | OTP 6 digits, 5 min TTL, 5 attempts, then 15 min lock. Resend after 30 s. Refresh rotation with reuse detection. Access token 15 min. Logout revokes family | auth module | 3 |
| A08 Integrity failures | Razorpay signature (HMAC SHA 256) checked on verify and webhook. Webhook uses raw body. Idempotency keys | payments module | 6 |
| A09 Logging failures | pino JSON logs with request id. Audit log for sensitive actions. Never log OTP, tokens, signatures, full phone, full email | common | 1, 18 |
| A10 SSRF | API makes outbound calls only to Razorpay, Resend. No user supplied URLs are fetched | | |

## Rate limits (Redis backed, per IP and per user)

| Endpoint | Limit |
| --- | --- |
| `POST /auth/otp/request` | 3 per target per 10 min, 10 per IP per hour |
| `POST /auth/otp/verify` | 5 per target per 10 min |
| `POST /auth/refresh` | 30 per user per hour |
| `GET /search/trips`, `GET /places/search` | 60 per IP per minute |
| `POST /bookings` | 10 per user per 10 min |
| `POST /payments/*` | 20 per user per 10 min |
| `POST /tickets/validate` | 120 per conductor per minute |
| `POST /tracking/ping` | 30 per device per minute |
| `POST /feedback` | 5 per IP per hour |
| `POST /auth/google` | 10 per IP per minute (D-043) |
| `GET /places/nearby` | 60 per IP per minute (same as search) |
| Default for everything else | 120 per user or IP per minute |

Over the limit: 429 `RATE_LIMITED` with `Retry-After`.

## Web security headers (Next.js `headers()`)

- `Content-Security-Policy`: `default-src 'self'`; `script-src 'self' https://checkout.razorpay.com` plus Next nonce; `connect-src 'self' <WS_URL> https://api.razorpay.com https://tiles.openfreemap.org`; `img-src 'self' data: blob: https://tiles.openfreemap.org`; `frame-src https://api.razorpay.com https://checkout.razorpay.com`; `worker-src 'self' blob:`.
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(self), geolocation=(self), microphone=()`

## Tokens on the web

- Access token lives in memory only (React context). Never in `localStorage`.
- Refresh token is the httpOnly cookie, same origin through the Next rewrite.
- On 401 the API client calls `/auth/refresh` once, retries once, then sends the user to `/login?next=`.

## Sign in with Google (D-043)

- The browser gets a Google ID token from Google Identity Services and posts it to `POST /auth/google`. The API never trusts the token itself: it asks Google (`oauth2.googleapis.com/tokeninfo`), then checks `aud` equals `GOOGLE_CLIENT_ID`, issuer, expiry and `email_verified`.
- The account is found by email or created as CITIZEN; the same refresh cookie and `auth.login` audit (with `method: google`) as OTP.
- CSP adds `https://accounts.google.com/gsi/client` (script), `/gsi/style` (style), `/gsi/` (connect and frame). Without the client id the button is hidden and the endpoint answers 403.
- QR period is 3 s (D-042); the server accepts the previous, current and next step only, so a shared screenshot stops working in seconds.

## GPS trust (plan sec 62)

A ping is accepted only when all are true: the caller is a DRIVER, the `X-Device-Key` matches an approved, not revoked device of that driver, the trip is RUNNING and assigned to that driver now, and the point is sane (inside the bounding box of the trip's state plus about 50 km, from the `states` row, D-034, speed under 120 km/h, timestamp within 2 min of server time). Rejected pings are counted, not stored.

## Identity data (plan sec 51)

- No Aadhaar number, ID number or document image is collected or stored.
- `eligibility_checks` keeps only: scheme, result, reason code, provider reference, checked and expiry time.
- Consent text is shown and its version saved with the check.

## Payments (plan sec 52)

- Amount is always computed on the server from `fare_rules`. Client amounts are ignored.
- `raw` payment payload stored with card and VPA details removed.
- Only Razorpay **test** keys exist anywhere in this project. A live key in any env fails the boot check.

## Audit events (write to `audit_logs`)

`auth.login`, `auth.logout`, `auth.refresh_reuse_detected`, `booking.create`, `payment.verify`, `payment.webhook`, `ticket.activate`, `ticket.cancel`, `ticket.transfer`, `ticket.transfer_denied`, `ticket.scan`, `refund.create`, `pass.create`, `pass.activate`, `eligibility.check`, `trip.start`, `trip.end`, `trip.assign`, `trip.replace_bus`, `trip.cancel`, `incident.create`, `incident.acknowledge`, `incident.resolve`, `device.register`, `device.approve`, `device.revoke`, `role.grant`, `role.revoke`, `policy.update`, `settings.update`, `network.update`, `complaint.update`, `report.export`.

## Secrets

| Secret | Where |
| --- | --- |
| `JWT_SECRET` (or Ed25519 pair) | API env |
| `OTP_PEPPER` | API env |
| `QR_SIGNING_PRIVATE_KEY`, `QR_SIGNING_KEY_ID` | API env (PEM, base64) |
| `QR_SECRET_KEY` | API env (32 bytes base64) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | API env. `KEY_ID` also public to web |
| `RESEND_API_KEY` | API env |
| `DATABASE_URL`, `DIRECT_URL`, `REDIS_URL` | API env |

Rules: `.env` is git ignored. `.env.example` lists every key with a fake value. Rotate anything that is ever pasted into chat, a ticket or a screenshot.

## Day 17 hardening pass (Dev B)

1. Run through this doc line by line and tick each row with a link to the code.
2. Try the attacks: another user's ticket id, a depot manager on another depot, replayed payment verify, replayed webhook, forged QR, screenshot QR after 90 s, GPS ping from an unapproved device, OTP brute force, oversized bodies (limit 100 kb), SQL like input in search.
3. Record results in `progress/daily-log.md`.
