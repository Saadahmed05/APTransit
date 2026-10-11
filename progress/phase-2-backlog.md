# Phase 2 backlog

Everything from `docs/02-mvp-scope.md` (Out of scope, Stretch) that the 20 days did not build, plus items parked in `progress/decisions-log.md`. Ordered by priority for a pilot. Size: S (days), M (one to two weeks), L (a month or more).

| # | Item | Why it matters | Size | Plan sec |
| --- | --- | --- | --- | --- |
| 1 | Native Android driver app | GPS from a PWA stops when the screen locks on some phones; a native app keeps background location and works with poor networks | L | 5 |
| 2 | Real identity provider for free travel (Aadhaar based eKYC or DigiLocker) | Today eligibility is a self declaration with a mock provider; a pilot needs a verified check without storing ID numbers | L | 19, 51 |
| 3 | SMS delivery (DLT registration) | Most citizens expect SMS for OTP and trip alerts; phone OTP is dev only today | M | 65 |
| 4 | Production hosting in India | Staging uses Neon Singapore, Upstash and Render; government data rules need India region hosting, backups and access logs | L | 83 |
| 5 | Map provider choice | OpenFreeMap tiles have no SLA; a pilot needs a provider with terms, quotas and Telugu labels | S | 13 |
| 6 | Offline conductor scanning (ADR 003, D-031) | Buses lose signal on highways; validation must work offline with the public key and a trip pack, first scan wins on sync | M | 77 |
| 7 | MFA for senior staff | State admins and depot managers can cancel trips, refund and change fares | S | 50 |
| 8 | Driver offline action queue | Start, end and incidents fail without signal today; only GPS points are buffered | M | 62 |
| 9 | Web Push notifications | In app and email only today; push reaches citizens with the app closed | S | 64 |
| 10 | Real Razorpay live mode and settlement reports | Test mode only by design (docs/12); live needs KYC, reconciliation and refund operations | M | 52 |
| 11 | Multi region hosting, WAF, CDN rules | Depends on the government hosting decision | M | 83 |
| 12 | Base seed crews per depot | docs/19 asks for drivers and conductors per depot; the seed has one of each for Kurnool (Day 15 log) | S | 19 |
| 13 | Load test from several IPs on staging | Search is limited to 60 per IP per minute; a 50 rps test needs distributed load (Day 17 log) | S | 14 |
| 14 | Lost and found | Optional in the plan | S | 42 |
| 15 | Student rewards | Needs anti misuse rules | M | 44, 76 |
| 16 | AI assistant | Must never invent data; needs its own design and evaluation | L | 73 |
| 17 | Local business ads | Needs an admin review flow and an ads policy | M | 45, 74 |
| 18 | Local events and places | Content work, not core transport | M | 46, 75 |
| 19 | Dark mode polish beyond tokens | Charts and maps are readable today; illustrations and empty states can improve | S | 9 |
| 20 | Per state time zones (v2 P2, D-034) | Every Indian state is IST today, so one `PLATFORM_TIME_ZONE` is enough; a state outside IST needs zone aware rollups, schedules and display | M | |
| 21 | State admin screen (v2 P2, D-034) | States arrive by migration or seed; an admin screen must validate bounds and refuse a zone other than the platform zone | S | |
| 22 | Future low cost bus tracking hardware, research (v2 journey plan) | Cheap tags could track buses without a driver phone; research only, no promise that it works like Apple Find My | M | |
