# 11 · Screens

**Status: LOCKED.** Owner: Dev A. Every route, what it shows, and which day it ships. Every screen must handle **loading** (skeleton), **empty**, **error** (message + Retry) and **success**. Screens marked "mobile first" are designed at 360 px, then scaled up. "Desktop first" at 1280 px, then down to 768 px.

## Citizen (mobile first)

| Route | Purpose | Key elements | Empty state | Day |
| --- | --- | --- | --- | --- |
| `/` | Home (plan sec 6) | Question "Where do you want to go?", From, To, swap, date chips, Search buses. Quick actions: Track bus, My tickets, My passes, Timetable. Updates strip (max 2 items) | No updates: hide the strip | 4 |
| `/` (v3, D-042) | Home after login | Login first: `/` needs a session. Google Maps style: From and To bars, swap, date, Search, then "Pick on the map" (MapLibre, every stop a dot, tap for "Set as from" or "Set as to"), "Use my location" (nearest stop as From), and a keyboard list of nearby stops | "No stops found here." | v3 |
| `/login` | Log in (sec 7) | Bus splash on load, Sign in with Google (D-043, hidden without a client id), "or", email or phone tabs, Send code, OTP boxes, resend timer, `?next=` redirect | | 4 |
| `/search` | Results (sec 8) | Sticky summary (From to To, date, edit), time filter chips (Morning, Afternoon, Evening, Night), TripCard list | "No buses for this date." Buttons: Next day, Change route | 5 |
| `/bus/[tripId]` | Bus details (sec 9) | Service type, bus number, departure, arrival, fare, seats left, live status, boarding points, stops. Actions: Book ticket (primary), Track bus, View route | | 5 |
| `/timetable` | Drill down (sec 10) | District list, then bus stand, then routes. Breadcrumb | | 5 |
| `/timetable/route/[routeId]` | Route timetable | First, last, next bus, frequency, date switcher, list of trips with status, stops list | "No trips run on this date." | 5 |
| `/book/[tripId]` | Booking step 1: points and seat (sec 11) | Stepper, boarding and destination pickers (prefilled from search), SeatMap, fare summary bar with Continue | | 6 |
| `/book/[tripId]/details` | Step 2: passengers | One card per seat: name, age, gender. "Use my details" for the first passenger. Continue creates the booking and starts the seat hold | | 6 |
| `/book/[tripId]/review` | Step 3: review and pay | Hold timer, trip summary, passengers, fare breakdown, refund tiers (from the fare endpoint), Pay ₹X (primary, wired to Razorpay on Day 7) | | 6 |
| `/book/done/[bookingId]` | Confirmation | Success icon, "Ticket booked", ticket preview, View ticket, activation hint with time | | 7 |
| `/tickets` | My tickets | Tabs Upcoming, Past. TicketCard list sorted by departure | "No tickets yet." Search buses | 7 |
| `/tickets/[id]` | Ticket (sec 12, 13) | Full ticket, status badge, QR when ACTIVE (rotating, colour of the day, live clock), Activate (slide or hold to confirm), Gift, Cancel, Track bus | | 8 |
| `/tickets/[id]/gift` | Gift (sec 21) | Recipient phone or email, rules in one line, Confirm dialog | | 9 |
| `/tickets/[id]/cancel` | Cancel | Refund quote, policy line, Cancel ticket (danger) | | 8 |
| `/passes` | My passes (sec 16, 17) | Active pass with Countdown and QR, other passes, Buy pass | "No passes." Buy pass | 9 |
| `/passes/buy` | Buy pass (sec 18) | Pass types as cards with price, validity, services, zone badge. Zone passes ask for the district. "This pass is for my child" adds name and age (child card). Select, then pay | | 9 |
| `/free-travel` | Free travel (sec 19) | Explainer, consent, declaration, ID type, result (eligible or reason), Activate pass | | 9 |
| `/track` | Track entry | Enter ticket or pick from upcoming tickets, or search route | | 12 |
| `/track/[tripId]` | Live tracking (sec 22 to 24) | Map (top half), RouteProgress (bottom sheet), next stop, ETA, delay chip, status badge, last updated time | Trip not started: "Tracking starts when the bus leaves {stop} at {time}." | 12 |
| `/terms` | Terms and conditions (D-042) | Public. Tickets, groups, passes, child cards, live QR, refunds, conduct, data, account | | v3 |
| `/updates` | Notifications inbox | Grouped by day, icon, title, body, time, unread dot, Mark all read | "You are all caught up." | 9 |
| `/feedback` | Feedback (sec 40) | Email (prefilled when logged in), category chips, message, optional ticket, bus, route, date. Submit shows complaint code | | 17 |
| `/feedback/status` | Complaint status (sec 41) | Code + email lookup, status timeline | | 17 |
| `/account` | Account | Name, email, phone (masked), language, theme, role switcher (staff), Passes help and terms links, Log out | | 4 |

Booking step 2 shows "Under 12 travels at half fare" under each age; step 3 shows adults, children and the child fare. Search shows "next day" arrivals on long journeys. The ops trip page (`/ops/trips/[id]`) adds a "Passengers per stage" table (booked, boarded, getting off per stop).

## Driver (mobile first, large targets)

| Route | Purpose | Key elements | Day |
| --- | --- | --- | --- |
| `/driver` | Before trip (sec 25) | "Good morning, {name}", bus number, route, departure, status READY, device approval state, Start trip (xl, primary) | 11 |
| `/driver/trip/[id]` | During trip | TRIP ACTIVE, GPS status (Active, Weak, Off) with icon, next stop + ETA, Report issue (secondary), End trip (confirm dialog). Wake lock on. No scrolling needed | 11 |
| `/driver/report` | Report issue (sec 26, 33) | Big tiles: Delay, Traffic, Breakdown, Accident, Road block, Medical, Other. Optional note. Sends with location | 11 |
| `/driver/setup` | Device setup | Register this phone, shows pending or approved | 11 |

## Conductor (mobile first, scanner first)

| Route | Purpose | Key elements | Day |
| --- | --- | --- | --- |
| `/conductor` | Trip for today (sec 27) | Route, Passengers, Checked, Pending counts, Scan ticket (64 px) | 13 |
| `/conductor/scan` | Scanner (sec 28) | Full screen camera, frame with "Place QR inside the frame", torch toggle, manual code entry fallback | 13 |
| `/conductor/scan` (overlay) | Result overlay, part of the scanner page, not a separate route, so the camera stays warm | Full screen success or danger colour, icon, VALID or INVALID, reason line, passenger name, seat, route. Auto returns to scanner after 3 s or on tap. Haptic + sound | 13 |
| `/conductor/manifest` | Seat list | Seats with Checked or Pending | 13 |

## Depot operations (desktop first)

| Route | Purpose | Key elements | Day |
| --- | --- | --- | --- |
| `/ops` | Dashboard (sec 29) | KPI tiles: Active buses, Total buses, Active trips, Delayed trips, Breakdowns. Bus status legend. Live map of depot buses. Incidents panel (live) | 14 |
| `/ops/buses` | Fleet (sec 31) | DataTable: bus number, type, status, route now, driver, maintenance due. Filters. Add bus | 14 |
| `/ops/buses/[id]` | Bus profile (sec 30) | All profile fields, trip history, maintenance records, Set maintenance | 15 |
| `/ops/trips` | Trips (sec 32) | Date picker, DataTable: code, route, departure, bus, driver, status, delay, passengers. Assign | 14 |
| `/ops/trips/[id]` | Trip detail | Timeline, assignment history, passengers count, incidents, Replace bus, Cancel trip | 15 |
| `/ops/trips/[id]/replace` | Replacement (sec 34) | Reason, available buses list, driver pick, confirm, shows how many passengers will be notified | 15 |
| `/ops/incidents` | Incidents (sec 33) | Live list, type, severity, bus, trip, location mini map, Acknowledge, Resolve | 14 |
| `/ops/staff` | Drivers and conductors | Two tabs, table, add staff, device approvals | 15 |
| `/ops/complaints` | Complaints inbox (sec 41) | Table, status filter, detail drawer, reply note, status change | 17 |

## Government (desktop first)

| Route | Purpose | Key elements | Day |
| --- | --- | --- | --- |
| `/gov` | Command center (sec 35) | KPI row: Active buses, Active trips, Passengers today, Delayed trips, Incidents. AP map with one marker per district HQ coloured by delay level, clustered bus markers, incident markers. Live incident feed | 16 |
| `/gov/district/[id]` | Drill down (sec 36) | Same layout scoped to district, depots list | 16 |
| `/gov/depot/[id]` | Depot level | Depot KPIs, routes list | 16 |
| `/gov/route/[id]` | Route level | Trips today, delay pattern, demand bands, buses on route | 16 |
| `/gov/trip/[id]` | Trip level | Live tracking view + trip facts | 16 |
| `/gov/analytics` | Analytics (sec 37 to 39) | Tabs Routes, Buses, Passengers, Delays, Demand. Date range. Charts plus tables | 17 |
| `/gov/reports` | Reports (sec 72) | Daily, Weekly, Monthly cards, date range, Download CSV | 17 |

## Admin (desktop first)

| Route | Purpose | Day |
| --- | --- | --- |
| `/admin` | Overview with links and recent audit events | 15 |
| `/admin/routes`, `/admin/routes/[id]` | Routes with ordered stop editor | 15 |
| `/admin/stops` | Stops table with map pin preview | 15 |
| `/admin/timetables` | Timetable editor per route: departure time, bus type, days, validity. Generate trips | 15 |
| `/admin/users` | Search users, add or remove staff roles with scope | 15 |
| `/admin/policies` | Fare rules, refund policy tiers, settings (forms with clear units) | 15 |
| `/admin/audit` | Audit log table with filters and before and after diff | 15 |

## Shared

| Route | Purpose | Day |
| --- | --- | --- |
| `/design` | Component gallery, dev only | 3 |
| `/offline` | Offline fallback page for the service worker | 10 |
| `not-found`, `error` | Friendly 404 and error boundary with Retry and Home | 3 |

## Screen checklist (every screen)

- One `h1`. Title also in `<title>` as "{Page} · AP TransitOS".
- Works at 360, 768, 1280 px with no horizontal scroll.
- All four states designed, not just success.
- All text from i18n keys, checked in Telugu for overflow.
- Keyboard: tab order follows visual order, focus visible, Escape closes overlays.
- Back navigation keeps state (search params in the URL, not only in memory).
