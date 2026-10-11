# 02 · MVP scope (20 days, 2 developers)

**Status: LOCKED.**

## Reality check

The full plan (113 sections) is a multi month program. In 20 days two developers can ship a **working, demo ready vertical slice of every surface**: citizen, driver, conductor, depot, government, admin. Depth goes to the core journey (search to scan). Everything else is either thin but real, or explicitly out.

## In scope

| Area | What ships | Plan sec |
| --- | --- | --- |
| Foundation | Monorepo, CI, design system, English and Telugu, PWA shell | 5, 47, 48, 55, 95 |
| Auth | Email OTP (real, via Resend), phone OTP (dev mode, printed to API log), JWT with refresh rotation, roles | 7, 49, 50 |
| Network data | Districts, bus stands, stops, routes, route stops, timetables, trips, seeded with real AP names | 10 |
| Search | From, to, date. Results with departure, service, arrival, seats | 8 |
| Bus details | Fare, boarding points, stops, seats left, live status | 9 |
| Timetable | Drill down: district, bus stand, route, trips. First, last, next bus, frequency | 10 |
| Booking | Boarding point, destination, seat map, passenger details, 10 minute seat hold | 11 |
| Payments | Razorpay test mode: order, checkout, server signature check, webhook, idempotent ticket creation | 52 |
| Tickets | Digital ticket, signed rotating QR, activation, status machine, history | 12, 13, 15 |
| Cancel and refund | Rule based refund from a policy table, Razorpay test refund | 53 |
| Gifting | Paid, not activated tickets to another registered user | 21 |
| Passes | Weekly and monthly, eligibility, payment, activation, live countdown | 16, 17, 18 |
| Free travel | Stree Shakti style flow with a mock eligibility provider, never giftable | 19, 20, 51 |
| Driver app | Trip for today, start, GPS share, report issue, end | 25, 26 |
| Live tracking | Socket.IO, route progress strip, map, ETA, delay, status colours | 22, 23, 24 |
| Conductor app | Camera scanner, VALID or INVALID with reason, trip counts | 14, 27, 28 |
| Depot ops | Dashboard, buses, trips, staff, incidents, replacement bus | 29 to 34 |
| Admin | Routes, stops, timetables, users and roles, fares, refund policy, audit log | 71 |
| Government | Command center map, KPIs, drill down, analytics, CSV reports | 35 to 39, 72 |
| Feedback | Feedback form, complaint ID, status updates, ops inbox | 40, 41 |
| Notifications | In app inbox and email for booking, activation, delay, cancellation, pass expiry, complaint update | 43, 65 |
| Quality | Unit, integration, Playwright e2e, a11y checks, staging deploy, GPS simulator | 78 to 81 |

### Added in v3 (owner request, D-042 and D-043)

- Login first with a bus opening animation, light blue and white theme.
- Google Maps style home: From and To bars plus a stop map picker and "use my location".
- Village journeys list village buses only (service fit). Long overnight journeys.
- Single and group tickets (children under 12 at half fare), day, weekly, monthly and zone (one district) passes, child cards that message the parent on boarding.
- Live QR rotates every 3 seconds. Passengers per stage on the ops trip page. Terms and conditions page. Sign in with Google.

## Out of scope (Phase 2 backlog)

| Item | Why not now | Plan sec |
| --- | --- | --- |
| Native Android and iOS apps | PWA covers the demo | 5 |
| Real Aadhaar or identity provider | Needs government approval and agreements | 19, 51 |
| SMS delivery | Paid DLT registration in India | 65 |
| Student rewards | Nice to have, needs anti misuse rules | 44, 76 |
| Local business ads | Needs admin review flow and policy | 45, 74 |
| Local events and places | Content work, not core transport | 46, 75 |
| AI assistant | Must never invent data, needs its own design | 73 |
| Lost and found | Optional per plan | 42 |
| MFA for senior staff | Add after the pilot login method is fixed | 50 |
| Multi region hosting, WAF, CDN rules | Government hosting rules decide this | 83 |

## Stretch (only if a day finishes early)

1. Offline conductor scanning with cached public key and trip manifest (sec 77).
2. Driver offline action queue beyond the GPS buffer.
3. Web Push notifications on top of in app and email.
4. Dark mode polish beyond token level.

## Demo story

See "What success looks like on Day 20" in [01-product-brief.md](01-product-brief.md). Every day's work must move one step of that story closer to working on staging.

## Scope guard

If a task is not in the "In scope" table, it is not built in these 20 days. Log the idea in `progress/decisions-log.md` under "Parked".
