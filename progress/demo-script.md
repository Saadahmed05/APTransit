# Demo script: AP TransitOS (12 minutes)

The story from `docs/01-product-brief.md` ("What success looks like on Day 20"), as numbered steps. Each step says who does it, on which device, with which account, where to click, what the audience should notice, and the fallback.

Accounts are the seeded ones from `docs/08-roles-permissions.md`. Login is email OTP; with `OTP_DEV_ECHO=1` on staging the code is shown in the API response and in the API log.

## Warm up (start 30 minutes before)

1. Open `https://<render-api>/api/v1/health`. Wait for HTTP 200 with `"db":"ok","redis":"ok"`. Render free instances sleep: the first call can take about a minute.
2. Check `"worker":"ok"` and a small `workerAgeSec`. If stale, restart the Render worker service.
3. Reset the demo data if the last rehearsal changed it (see "If data gets messy" below).
4. Make a demo ticket for step 1 if the live booking is risky: book seat 18 on tomorrow's 06:30 Kurnool to Vijayawada Express as `citizen@aptransit.test`, pay, keep it booked. Move it into its activation window with `pnpm --filter api demo:window <ticket code> 30` (development only; on staging use a trip that leaves in about 30 minutes).
5. Start the simulator 10 minutes before: `pnpm simulate --all --depot KNL --api https://<render-api>` and leave the terminal visible.
6. Log in on each device:
   - Citizen phone (Android Chrome): `citizen@aptransit.test`, installed as an app, language English.
   - Conductor phone: `conductor.knl@aptransit.test`, camera permission granted on `/conductor/scan`.
   - Driver: simulator terminal, or a phone logged in as `driver.knl@aptransit.test` on `/driver` with an approved device.
   - Laptop tab 1: `manager.knl@aptransit.test` on `/ops`.
   - Laptop tab 2: `transport@aptransit.test` on `/gov`.
7. Brightness up on the phones, notifications from other apps off, phones and laptop charged, phone mirroring tested.
8. Open the backup recording in a separate tab (stored outside the repo).

## The story

| # | Who, device, account | URL and clicks | What the audience should notice | Fallback |
| --- | --- | --- | --- | --- |
| 1 | Presenter, laptop, logged out | `/` | One platform: citizen, driver, conductor, depot and government apps from one login screen. Language switch English and Telugu at the top | Screenshot of the home page |
| 2 | Citizen, phone, `citizen@aptransit.test` | `/` From Kurnool, To Vijayawada, today or tomorrow, Search | Results with service type, seats left, fare; time band chips | Use the prepared search link |
| 3 | Citizen, phone | Open the 06:30 Express, Book, pick seat 18, fill name, age, gender, Review | Live seat map, 10 minute hold timer, fare from the server | Use the prepared ticket from warm up step 4 |
| 4 | Citizen, phone | Pay with Razorpay test UPI (`success@razorpay`) | Payment confirmation, ticket in My tickets, email confirmation | With `PAYMENTS_FAKE=1`, the fake checkout completes the same way |
| 5 | Citizen, phone | `/tickets/<id>`, Activate | Rotating QR changes every 30 s; a screenshot stops working | Show the prepared active ticket |
| 6 | Driver, simulator | Simulator running for the demo trip | Trip goes RUNNING | Start the single trip: `pnpm simulate --trip <tripId>` |
| 7 | Citizen, phone | Track bus from the ticket | Bus moves on the map, next stop and ETA update, delay shown | `/track/<tripId>` on the laptop |
| 8 | Conductor, phone, `conductor.knl@aptransit.test` | `/conductor/scan`, scan the citizen QR | Green VALID within 2 seconds, passenger name and seat | Manual entry: ticket number plus the 8 character live code |
| 9 | Conductor, phone | Scan the same QR again | Red ALREADY SCANNED with the first scan time | Same as above |
| 10 | Driver, simulator | `pnpm simulate --trip <tripId> --breakdown-at 60` (or Report issue on the driver phone) | Breakdown reported with GPS position | Show the open breakdown already in the seed (AP 39 Z 101) |
| 11 | Depot manager, laptop tab 1 | `/ops` incident appears, Acknowledge, open the trip, Replace bus, pick a bus, confirm | Incident arrives without refresh, the confirm dialog names the consequence ("38 passengers will be notified") | Replace from `/ops/trips/<id>/replace` directly |
| 12 | Citizen, phone | Bell icon | Replacement bus notification in English (and Telugu after switching) | Updates page `/updates` |
| 13 | Transport officer, laptop tab 2 | `/gov`: map, incident feed, KPIs; click Kurnool, then the depot, route, trip | Incident on the AP map, live numbers, drill down from the state to one trip | `/gov/district/<id>` link from the district list |
| 14 | Transport officer | `/gov/analytics` Delays tab, then `/gov/reports` Download CSV | Evening delay peak and "mostly 6 PM to 9 PM" sentence; CSV opens in Excel with Telugu names | Show a CSV downloaded during warm up |
| 15 | Presenter | Switch to తెలుగు on the citizen phone and the command center | Every screen in Telugu, same data | Screenshots in `progress/screenshots/` |

Close with the pitch line: "Not just another bus booking app, but one connected platform that brings citizens, buses, transport staff and government together."

## If data gets messy

- Restore the Neon snapshot taken after the demo reset (`demo-backup-<date>`): create a branch from it in the Neon console and point `DATABASE_URL` and `DIRECT_URL` of the Render services at it, then redeploy. Practice once in the morning.
- Or rerun the seed against staging: `pnpm db:seed --history 14` (deletes and recreates past days and the synthetic citizens; today's demo accounts stay).

## Known demo risks

- Render free instances sleep after about 15 minutes idle; keep `/health` open and refresh it during the talk.
- Upstash free tier counts commands; the worker drain delay is 60 s (docs/15).
- Camera scanning needs HTTPS and good light; the manual entry fallback works without the camera.
