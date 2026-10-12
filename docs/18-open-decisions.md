# 18 · Open decisions and assumptions

**Status: LOCKED list, living answers.** Answers are added here only through `progress/decisions-log.md`.

## To confirm with the transport authority (plan sec 107)

| # | Item | Our assumption for the MVP | Where it lives |
| --- | --- | --- | --- |
| G1 | Official transport operator | APSRTC | Branding stays "AP TransitOS", no operator logo |
| G2 | Bus data source | Seed data, fictional registrations | [19](19-seed-data.md) |
| G3 | Route and timetable data source | Seed data based on real town names and approximate distances | [19](19-seed-data.md) |
| G4 | GPS source | Driver phone (PWA). Existing APSRTC vehicle tracking could feed the same `/tracking/ping` later | [13](13-realtime-tracking.md) |
| G5 | Ticket and fare rules | Demo per km fares by service type, reservation fee 30 rupees | `fare_rules` |
| G6 | Free travel rules | Stree Shakti: women, girls, transgender persons, AP domicile, 5 service types, photo ID on board | [07](07-ticket-and-pass-rules.md) section 9 |
| G7 | Identity check requirements | Self declaration + mock provider, no ID number stored | [12](12-security.md) |
| G8 | Payment provider | Razorpay (test mode) behind a `PaymentProvider` interface | payments module |
| G9 | Refund rules | 90, 75, 50 percent tiers, none under 1 h | `refund_policies` |
| G10 | Data storage and privacy | India region providers (Neon Singapore is the nearest free option; production must be in India) | [17](17-deployment.md) |
| G11 | Hosting requirements | Vercel + Render for staging only | [17](17-deployment.md) |
| G12 | Government system connections | None in MVP | |
| G13 | Retention periods for tickets, payments, audit logs | Keep everything during the pilot | [05](05-data-model.md) |
| G14 | Login method for citizens | Email OTP (real), phone OTP (dev only, SMS needs DLT registration) | [06](06-api-contract.md) |
| G15 | Platform name when more states join (v2 P2) | Code and data are state neutral (D-034); the product name stays "AP TransitOS" and the `APT-` and `APT1` prefixes stay platform wide until the client decides | [05](05-data-model.md) |
| G16 | Prices, durations and eligibility of the Day, Family, School and Annual passes (v2 P4) | DEMO values: Day 120, Weekly 450, Monthly 1,600, Family 1,000 (7 days, 4 people), School 600 (30 days, route restricted), Annual 15,000 rupees; shown with a "Demo price" chip (D-036) | [07](07-ticket-and-pass-rules.md) section 8 |
| G17 | Family pass group size and whether children count | Up to 4 VALID scans per trip, children count as people | [07](07-ticket-and-pass-rules.md) section 8 |
| G18 | School pass proof | Self declaration (consent, student, institution name not stored) with a mock provider; an institution letter, ID card or DigiLocker check later | [12](12-security.md) |

## Ticket rules to decide (plan sec 106)

| # | Question | MVP assumption |
| --- | --- | --- |
| T1 | Ticket types | Single trip (reserved seat), free travel (zero fare), weekly pass, monthly pass, free travel pass. Return, day, student, concession and event tickets are Phase 2 |
| T2 | Activation window | Opens 60 min before departure, closes 30 min after (plus delay) |
| T3 | Validity after activation | Until scheduled arrival + delay + 60 min |
| T4 | Expiry | Not activated in window: expired. Active but not scanned by validUntil: expired |
| T5 | Cancellation cutoff | 1 hour before departure, only if not activated |
| T6 | Gifting | Once, until 2 hours before departure, only paid and not activated |
| T7 | QR format | Ed25519 signed token + 30 s rotating code |
| T8 | Offline checking | Stretch goal: signature and expiry check offline, sync scans later, first scan wins |
| T9 | Pass validity | 7 or 30 days from activation, activate within 30 days of purchase |

## v3 values to confirm (D-042, assumptions)

| Item | Value used | Confirm with |
| --- | --- | --- |
| Child age and fare | Under 12 pays 50 percent of the adult ticket | APSRTC concession rules |
| Day pass price | 150 rupees, statewide ordinary to express | Transport authority |
| Zone day and monthly pass | 60 and 900 rupees, one district, village and city ordinary services | Transport authority |
| Child card age limit | Under 18 | Product owner |
| QR period | 3 s with one step either side | Field test on low end phones and slow scanners |
| Service fit | Village stop shows village services when any exist | Depot managers |
| Bus classes (D-044) | Normal: Pallevelugu, Ultra Pallevelugu, City Ordinary. Express: Metro Express, Express, Ultra Deluxe. Super Luxury: Super Luxury and the AC services | Transport authority |
| Ticket on another bus (D-044) | Same day, both stops on the route, same class or lower; no seat, no fare difference refunded | Product owner |

## Product conflicts we resolved (flag to product owner)

| # | Conflict in the plan | Resolution |
| --- | --- | --- |
| P1 | Sec 24 says Blue = Current, Green = Completed. Sec 29 says Blue = Maintenance, Green = Running, Yellow = Delayed | One map: Running and Current blue, Completed green, Delayed amber, Incident red, Maintenance violet, Upcoming neutral ([09](09-design-system.md)) |
| P2 | Sec 7 puts login before home | Guests can search, see timetables and track. Login only when booking or viewing tickets and passes |
| P3 | Sec 15 has 9 statuses including Created, Paid, Valid | Booking holds Created and Paid. Valid is derived from Active. Ticket enum has 7 values ([05](05-data-model.md)) |
| P4 | Sec 40 feedback is "Email, Feedback, Submit" but sec 41 needs tracking | Every feedback gets a complaint code and a status page |
| P5 | Sec 20 free tickets not giftable, sec 21 gifting rules "unless final rules allow" | Only paid, not activated tickets. Configurable in `settings` |

## Internal items

| # | Item | Owner | Due |
| --- | --- | --- | --- |
| I1 | Telugu strings reviewed by a native speaker | Dev A | Day 18 |
| I2 | District list check: AP district names change over time. Seed uses a subset; confirm names before any pilot | Dev B | Day 19 |
| I3 | Decide Upstash pay as you go if free tier runs out | Dev B | when needed |
| I4 | Map tiles: OpenFreeMap is free and keyless but has no SLA. Production needs a paid or self hosted option (plan sec 61) | Both | Phase 2 |
| I5 | Web GPS stops when the screen is off. Native driver app or vehicle GPS in Phase 2 | Both | Phase 2 |
