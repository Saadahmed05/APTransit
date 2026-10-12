# 06 · API contract

**Status: LOCKED.** Source: plan sec 66, 67. Owner: Dev B builds, Dev A consumes. All shapes live as zod schemas in `packages/shared/src/schemas/<area>.ts`.

## Basics

| Item | Rule |
| --- | --- |
| Base path | `/api/v1` |
| Web to API | Same origin. `apps/web/next.config.ts` rewrites `/api/v1/:path*` to `API_URL`. Keeps the refresh cookie first party |
| WebSocket | Direct to `NEXT_PUBLIC_WS_URL`, namespace `/live`, token in handshake `auth` |
| Format | JSON, `camelCase` keys, dates as ISO 8601 UTC strings, money as integer paise |
| Auth | `Authorization: Bearer <accessToken>` (JWT, 15 min). Refresh token in httpOnly cookie `apt_rt`, `Secure`, `SameSite=Lax`, path `/api/v1/auth`, 30 days, rotated on every use |
| Ids | Public ids are cuid2. Never expose sequential ids |
| Idempotency | `POST /bookings`, `POST /payments/verify`, `POST /tickets/:id/activate`, `POST /tickets/:id/transfer` accept `Idempotency-Key` header (uuid). Same key and body returns the first result |
| Pagination | Cursor: `?cursor=<id>&limit=20` (max 100). Response `{ items: [], nextCursor: string or null }` |
| Schema names | `<Thing>Input` for request bodies, `<Thing>Dto` for responses, `<Thing>Query` for query strings |

## Error shape

```json
{
  "error": {
    "code": "SEAT_TAKEN",
    "message": "Seat 18 is no longer available",
    "details": { "seatNo": "18" },
    "requestId": "req_01J9..."
  }
}
```

- `code` is a stable UPPER_SNAKE value from `packages/shared/src/errors.ts`. The web app shows `t('errors.' + code)`, never `message`.
- HTTP status: 400 validation, 401 no or bad token, 403 role or scope, 404 not found, 409 state conflict, 410 expired, 422 business rule, 429 rate limit, 500 server, 503 outside service unavailable (email; D-041).

Core error codes: `VALIDATION_FAILED, UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, RATE_LIMITED, OTP_INVALID, OTP_EXPIRED, OTP_TOO_MANY_ATTEMPTS, SEAT_TAKEN, HOLD_EXPIRED, BOOKING_NOT_PAYABLE, PAYMENT_SIGNATURE_INVALID, PAYMENT_AMOUNT_MISMATCH, TICKET_NOT_ACTIVATABLE, TICKET_ALREADY_ACTIVE, ACTIVATION_WINDOW_CLOSED, TICKET_NOT_CANCELLABLE, TICKET_NOT_GIFTABLE, RECIPIENT_NOT_FOUND, GIFT_TO_SELF, PASS_NOT_ELIGIBLE, PASS_ALREADY_ACTIVE, ELIGIBILITY_REQUIRED, DEVICE_NOT_APPROVED, TRIP_NOT_ASSIGNED, TRIP_NOT_STARTABLE, BUS_NOT_AVAILABLE, EMAIL_DELIVERY_FAILED (503, D-041), INTERNAL`.

## Endpoints

Auth column: `public`, `user` (any logged in), or role names from [08](08-roles-permissions.md). Day = the day Dev B ships it.

### Health and auth

| Method | Path | Auth | Body or query | Returns | Day |
| --- | --- | --- | --- | --- | --- |
| GET | /health | public | | `{ status, db, redis, version, time }`. HTTP 200 when db and redis are ok, 503 when degraded (decision D-006) | 1 |
| POST | /auth/otp/request | public | `{ channel: EMAIL or PHONE, target }` | 202 `{ expiresInSec: 300, resendInSec: 30 }`. Dev only: `devCode` when `OTP_DEV_ECHO=1` (then a failed email still answers 202). Email not sent: 503 `EMAIL_DELIVERY_FAILED` (D-041) | 3 |
| POST | /auth/otp/verify | public | `{ channel, target, code }` | `{ accessToken, user: MeDto }` + sets `apt_rt` | 3 |
| POST | /auth/google | public, 10 per IP per minute | `{ credential }` (Google ID token) | `{ accessToken, user: MeDto }` + sets `apt_rt`. 403 when `GOOGLE_CLIENT_ID` is unset, 401 when Google rejects the token (D-043) | v3 |
| POST | /auth/refresh | cookie | | `{ accessToken }` + rotates `apt_rt` | 3 |
| POST | /auth/logout | cookie | | 204, revokes token family | 3 |
| GET | /me | user | | `MeDto { id, name, email, phone (masked), preferredLocale, roles: [{ role, depotId, districtId, stateId }] }` | 3 |
| PATCH | /me | user | `{ name?, preferredLocale? }` | `MeDto` | 3 |

### Network, search, timetable (public)

| Method | Path | Query | Returns | Day |
| --- | --- | --- | --- | --- |
| GET | /places/search | `q` (min 2 chars), `limit` | `[{ id, kind: STOP or BUS_STAND, nameEn, nameTe, districtNameEn, districtNameTe, lat?, lng? }]` | 4 |
| GET | /places/nearby | `lat`, `lng`, `limit` (1 to 50, default 20) | `[{ ...place, lat, lng, distanceKm }]` closest first (map picker, D-042) | v3 |
| GET | /states | | `[{ id, code, nameEn, nameTe, center: { lat, lng }, bounds: [minLng, minLat, maxLng, maxLat], zoom }]` active states (D-034) | v2 P2 |
| GET | /districts | | `[{ id, code, nameEn, nameTe, stateId, busStandCount }]` | 4 |
| GET | /districts/:id/bus-stands | | `[{ id, nameEn, nameTe, routeCount }]` | 4 |
| GET | /bus-stands/:id/routes | | `[{ id, code, nameEn, nameTe, destination, serviceTypes[] }]` | 4 |
| GET | /routes/:id | | `RouteDto` with ordered stops | 4 |
| GET | /routes/:id/timetable | `date` | `{ firstDepartureLocal, lastDepartureLocal, nextDepartureAt, frequencyMin, trips: TripSummaryDto[] }` | 4 |
| GET | /search/trips | `from`, `to` (stop ids), `date` (YYYY-MM-DD), `after?` (HH:mm) | `TripSummaryDto[] { tripId, routeCode, serviceType, departureAt, arrivalAt, durationMin, farePaise, seatsLeft, displayStatus, delayMinutes, freeTravelEligible }` sorted by departure | 4 |

### Trips and booking

| Method | Path | Auth | Body or query | Returns | Day |
| --- | --- | --- | --- | --- | --- |
| GET | /trips/:id | public | | `TripDetailDto { route, busType, busRegNo?, boardingPoints[], droppingPoints[], stops[], seatsLeft, displayStatus, delayMinutes }` | 5 |
| GET | /trips/:id/seats | public | `from`, `to` | `{ layout, seats: [{ seatNo, state: FREE or TAKEN or HELD or BLOCKED }] }` | 5 |
| GET | /trips/:id/fare | public | `from`, `to` | `{ basePaise, reservationFeePaise, totalPaise, distanceKm, refundTiers: [{ minHoursBefore, percent }] }` | 5 |
| POST | /bookings | user | `{ tripId, boardingStopId, droppingStopId, passengers: [{ name, age, gender, seatNo }], useFreeTravel?: false }` (1 to 6 passengers, `useFreeTravel` allows 1) | `BookingDto { id, code, status: PENDING_PAYMENT, totalPaise, holdExpiresAt }`. With `useFreeTravel` and an active FREE_TRAVEL pass on an eligible service: status CONFIRMED, one FREE_TRAVEL ticket, no payment | 5 (free travel on 8) |
| GET | /bookings/:id | owner | | `BookingDto` | 5 |
| DELETE | /bookings/:id | owner | | 204, releases holds (only PENDING_PAYMENT) | 5 |

### Payments

| Method | Path | Auth | Body | Returns | Day |
| --- | --- | --- | --- | --- | --- |
| POST | /payments/orders | user | `{ bookingId }` or `{ passId }` | `{ orderId, amountPaise, currency: "INR", keyId, prefill: { name, email, contact } }` | 6 |
| POST | /payments/verify | user | `{ razorpayOrderId, razorpayPaymentId, razorpaySignature }` | `{ kind: BOOKING or PASS, bookingId?, ticketIds?, passId? }` | 6 |
| POST | /payments/webhook | Razorpay signature | raw body | 200. Handles `payment.captured`, `payment.failed`, `refund.processed` idempotently | 6 |
| POST | /payments/test/complete | user, **dev and CI only** | `{ orderId }` | Same as verify. Exists only when `APP_ENV` is not production and `PAYMENTS_FAKE=1`. Used by e2e tests instead of the Razorpay popup | 7 |

Rule: tickets or passes are created **only** inside the verify or webhook handler after the HMAC check and the amount check pass (sec 52).

### Tickets

| Method | Path | Auth | Body or query | Returns | Day |
| --- | --- | --- | --- | --- | --- |
| GET | /tickets | user | `scope: upcoming or past` | `TicketSummaryDto[]` | 7 |
| GET | /tickets/:id | holder | | `TicketDto` (all fields from sec 12 plus `displayStatus`, `canActivate`, `canCancel`, `canGift`, `activationOpensAt`) | 7 |
| GET | /tickets/:id/refund-quote | holder | | `{ percent, amountPaise, feePaise, policyName }` | 7 |
| POST | /tickets/:id/activate | holder | | `TicketDto` (ACTIVE, `validUntil`) | 7 |
| GET | /tickets/:id/qr | holder | | `{ token, rotSecret, periodSec: 30, serverTime }`. `rotSecret` only when ACTIVE. See [07](07-ticket-and-pass-rules.md) | 7 |
| POST | /tickets/:id/cancel | holder | | `{ ticket: TicketDto, refund: { amountPaise, status } }` | 7 |
| POST | /tickets/:id/transfer | holder | `{ recipient: phone or email }` | `{ ticketId, recipientMasked }` | 8 |
| POST | /tickets/validate | CONDUCTOR | `{ qr, tripId, deviceTime, offline?: false, position?: { lat, lng, accuracyM? } }` | `{ result: VALID or INVALID, reason: ScanReason, ticket?: { passengerName, seatNo, routeName, boarding, dropping, type }, context?: { ..., boardingStop: { stopId, nameEn, nameTe, source } or null, ticketFrom?, ticketTo?, validFrom?, ticketClass?, busClass?, anyBus? } }`. `position` is the scanning device's, used when the bus GPS is stale (D-035). A ticket of another bus the same day is accepted by the class rule (D-044, docs/07 section 7c); its `seatNo` is null. p95 under 300 ms | 12 |

### Passes and free travel

| Method | Path | Auth | Body | Returns | Day |
| --- | --- | --- | --- | --- | --- |
| GET | /pass-types | public | | `PassTypeDto[]` | 8 |
| GET | /passes | user | | `PassDto[]` | 8 |
| POST | /passes | user | `{ passTypeId, homeStopId?, destStopId? }` (both stops for a route restricted type, D-036) | `PassDto` (PENDING_PAYMENT, or READY for FREE_TRAVEL with a valid eligibility check). A type with a scheme needs a current ELIGIBLE check of that scheme (422 `ELIGIBILITY_REQUIRED`) | 8 |
| POST | /passes/:id/activate | owner | | `PassDto` (ACTIVE, `validFrom`, `validUntil`) | 8 |
| GET | /passes/:id/qr | owner | | same shape as ticket QR | 8 |
| POST | /eligibility/student | user | `{ consent, declaration: { isStudent, institutionName } }`, strict (no ID number) | `{ checkId, scheme: STUDENT, result, reasonCode?, expiresAt }`. The institution name goes to the provider and is never stored (D-036) | v2 P4 |
| POST | /eligibility/stree-shakti | user | `{ consent: true, declaration: { category: WOMAN or GIRL or TRANSGENDER, apDomicile: true }, idType: AADHAAR or VOTER_ID or RATION_CARD or OTHER_PHOTO_ID }` | `{ checkId, result, reasonCode?, expiresAt }` | 8 |
| GET | /eligibility | user | | latest check per scheme | 8 |

No ID number is sent or stored. The mock provider returns ELIGIBLE when consent and declaration are true. The conductor checks the physical photo ID on board, as in the real Stree Shakti scheme.

### Notifications

| Method | Path | Auth | Returns | Day |
| --- | --- | --- | --- | --- |
| GET | /notifications | user | paginated `NotificationDto[] { id, type, params, link, readAt, createdAt }` | 9 |
| GET | /notifications/unread-count | user | `{ count }` | 9 |
| POST | /notifications/:id/read | user | 204 | 9 |
| POST | /notifications/read-all | user | 204 | 9 |

### Driver, tracking, conductor

| Method | Path | Auth | Body | Returns | Day |
| --- | --- | --- | --- | --- | --- |
| POST | /driver/devices | DRIVER | `{ label }` | `{ deviceId, deviceKey }` (key shown once, pending approval) | 11 |
| GET | /driver/today | DRIVER | | `DriverTodayDto { assignment?, trip?, bus?, route?, stops[], deviceApproved }` | 11 |
| POST | /driver/trips/:id/start | DRIVER | | `TripDto` RUNNING | 11 |
| POST | /driver/trips/:id/end | DRIVER | | `TripDto` COMPLETED | 11 |
| POST | /tracking/ping | DRIVER + `X-Device-Key` | `{ tripId, points: [{ lat, lng, speedKmh?, headingDeg?, accuracyM?, recordedAt }] }` (1 to 20 points) | 202 | 11 |
| GET | /tracking/trips/:id/live | public | | `LiveTripDto { position?, nextStop, etaNextStopSec, delayMinutes, progress: [{ stopId, state: DONE or CURRENT or UPCOMING, etaAt }] }` | 11 |
| GET | /tracking/live | DEPOT_STAFF and up | `depotId?`, `districtId?` | `LiveBusDto[]` | 11 |
| POST | /driver/incidents | DRIVER | `{ type, severity?, note? }` | `IncidentDto` (trip, bus, GPS filled by server) | 11 |
| GET | /conductor/today | CONDUCTOR | | `{ trip, counts: { passengers, checked, pending } }` | 12 |
| GET | /conductor/trips/:id/manifest | CONDUCTOR | | `{ counts, seats: [{ seatNo, state: CHECKED or PENDING }] }`. Counts include tickets of other buses checked here (D-044) | 12 |
| GET | /conductor/trips/:id/alighting | CONDUCTOR | | D-044. `{ nextStop: { stopId, seq, nameEn, nameTe } or null, onBoard, stops: [{ stopId, seq, nameEn, nameTe, count, next }] }`: tickets checked on this bus per dropping stop, stops ahead only, nearest first. Next stop from live GPS, else the trip's last stop plus one | v3 |
| GET | /conductor/trips/:id/offline-pack | CONDUCTOR | | Stretch. `{ publicKeys: [{ keyId, pem }], tickets: [{ id, status, validUntil }], passes: [{ id, status, validUntil, eligibleServiceTypes }], generatedAt }` | 16 |
| POST | /tickets/validate/batch | CONDUCTOR | `{ tripId, scans: [{ qr, deviceTime }] }` | Stretch. Replays offline scans in device time order, first scan wins. Returns per scan result | 16 |

### Operations (depot)

All scoped to the caller's depot unless the caller has a district or state role.

| Method | Path | Body or query | Returns | Day |
| --- | --- | --- | --- | --- |
| GET | /ops/dashboard | `depotId?` | `{ activeBuses, totalBuses, activeTrips, delayedTrips, breakdowns, openIncidents, busStatusCounts }` | 13 |
| GET, POST | /ops/buses | list filters `status`, `q` | `BusDto[]` or created `BusDto` | 13 |
| GET, PATCH | /ops/buses/:id | | `BusProfileDto` (sec 30 fields + trip history) | 13 |
| POST | /ops/buses/:id/maintenance | `{ kind, startAt, endAt?, note? }` | `MaintenanceDto` | 13 |
| GET | /ops/buses/available | `at` | free buses at the depot | 13 |
| GET | /ops/trips | `date`, `status?`, `routeId?` | `OpsTripDto[]` | 13 |
| GET | /ops/trips/:id | | trip + assignment history + passengers count + incidents | 13 |
| POST | /ops/trips/:id/assign | `{ busId, driverId, conductorId? }` | `TripDto` | 13 |
| POST | /ops/trips/:id/replace-bus | `{ busId, driverId?, reason }` | `TripDto`. Notifies all ticket holders (sec 34) | 13 |
| POST | /ops/trips/:id/cancel | `{ reason }` | `TripDto`. Notifies holders, full refunds | 13 |
| GET, POST | /ops/staff | `type: DRIVER or CONDUCTOR` | `StaffDto[]` | 13 |
| GET | /ops/devices | `status?` | pending and approved devices | 13 |
| POST | /ops/devices/:id/approve and /revoke | | `DeviceDto` | 13 |
| GET | /ops/incidents | `status?` | `IncidentDto[]` | 13 |
| POST | /ops/incidents/:id/acknowledge | | `IncidentDto` | 13 |
| POST | /ops/incidents/:id/resolve | `{ note }` | `IncidentDto` | 13 |
| GET | /ops/complaints | `status?` | `ComplaintDto[]` | 16 |
| PATCH | /ops/complaints/:id | `{ status?, resolutionNote?, assignedToId? }` | `ComplaintDto`. Notifies the citizen | 16 |

### Admin

| Method | Path | Returns | Day |
| --- | --- | --- | --- |
| GET, POST, PATCH | /admin/stops, /admin/stops/:id | stops | 14 |
| GET, POST, PATCH | /admin/routes, /admin/routes/:id (with ordered stops) | routes | 14 |
| GET, POST, PATCH, DELETE | /admin/timetables, /admin/timetables/:id | timetables (delete = deactivate) | 14 |
| POST | /admin/trips/generate `{ from, to }` | generated trip count | 14 |
| GET | /admin/users `q?, role?` | users with roles | 14 |
| POST, DELETE | /admin/users/:id/roles, /admin/users/:id/roles/:roleId | roles. POST body `{ role, depotId?, districtId?, stateId? }`: state roles need `stateId`; a STATE_ADMIN grants only inside their state (D-034) | 14 |
| GET, PUT | /admin/fare-rules, /admin/refund-policies, /admin/settings | policy rows | 14 |
| GET, POST | /admin/pass-types | policy:write. `AdminPassTypeDto[]` with `soldCount`; POST creates a type (audit `pass_type.create`) | v2 P4 |
| PATCH | /admin/pass-types/:id | policy:write. Price, names, duration, mode, group size, services, demo, order, active; never kind, scheme or state. Applies to new sales only (audit `pass_type.update`, D-036) | v2 P4 |
| GET | /admin/audit-logs `entityType?, entityId?, actorId?, from?, to?` | paginated audit rows | 14 |
| GET | /admin/jobs/failed | last 50 failed background jobs with queue, name, reason, attempts, failedAt (STATE_ADMIN and up) | 18 |

### Government and analytics

| Method | Path | Query | Returns | Day |
| --- | --- | --- | --- | --- |
| GET | /gov/overview | `date?, stateId?` (one state of the caller's scope; 403 outside it, D-034) | `{ activeBuses, activeTrips, passengersToday, delayedTrips, openIncidents, onTimePct, ticketsToday, revenueTodayPaise }` | 15 |
| GET | /gov/map | `stateId?` | `{ districts: [{ id, activeBuses, delayed, incidents }], buses: LiveBusDto[], incidents: IncidentDto[] }` | 15 |
| GET | /gov/districts/:id, /gov/depots/:id, /gov/routes/:id | `date?` | drill down summary for that level (sec 36) | 15 |
| GET | /analytics/routes | `from, to, districtId?` | per route: passengers, trips, loadFactorPct, avgDelayMin, cancellations, revenuePaise | 15 |
| GET | /analytics/buses | `from, to, depotId?` | per bus: trips, km, utilisationPct, downtimeHours | 15 |
| GET | /analytics/passengers | `from, to` | ticketsSold, passUsage, busyHours[24], topRoutes | 15 |
| GET | /analytics/delays | `routeId?, from, to` | avg delay by hour of day, worst routes | 15 |
| GET | /analytics/demand | `routeId, from, to` | demand by band MORNING, AFTERNOON, EVENING, NIGHT with level LOW, MEDIUM, HIGH | 15 |
| GET | /reports/:kind.csv | `from, to` | CSV. kinds: `daily-operations`, `route-performance`, `complaints`, `tickets` | 15 |

### Feedback

| Method | Path | Auth | Body or query | Returns | Day |
| --- | --- | --- | --- | --- | --- |
| POST | /feedback | public (user optional) | `{ email, category, message, ticketCode?, busRegNo?, routeCode?, travelDate? }` | `{ code }` | 16 |
| GET | /feedback/mine | user | | `ComplaintDto[]` | 16 |
| GET | /feedback/status | public | `code`, `email` | `{ code, status, updatedAt, resolutionNote? }` | 16 |

## WebSocket (Socket.IO)

Namespace `/live`. Connect with `io(WS_URL + '/live', { auth: { token } })`. Token optional for public rooms.

| Client emits | Payload | Server check |
| --- | --- | --- |
| `subscribe` | `{ room }` | `trip:<id>`, `route:<id>` public. `depot:<id>` needs a role scoped to that depot. `district:<id>` needs that district, its state or SUPER_ADMIN. `state:<id>` needs a state role on that state or SUPER_ADMIN (D-034) |
| `unsubscribe` | `{ room }` | |

Authenticated sockets auto join `user:<userId>`.

| Server emits | Room | Payload |
| --- | --- | --- |
| `bus:position` | trip, route, depot, district, `state:<id>` | `{ tripId, busId, lat, lng, speedKmh, headingDeg, recordedAt, nextStopId, etaNextStopSec, delayMinutes, progressPct }` |
| `trip:status` | trip, depot, district, `state:<id>` | `{ tripId, status, displayStatus, delayMinutes, lastStopSeq }` |
| `incident:new`, `incident:update` | trip, depot, district, `state:<id>` | `IncidentDto` |
| `notification:new` | user | `NotificationDto` |
| `ticket:status` | user | `{ ticketId, status }` |
| `kpi:update` | depot, `state:<id>` | `{ scope, values }` every 15 s |

Throttle: at most one `bus:position` per trip per 2 s per room.

## v3 additive fields (D-042)

- `PassTypeDto.zoneScoped`, `PassDto.zoneDistrictId`, `PassDto.holderName`, `PassDto.holderAge`. `POST /passes` body adds `zoneDistrictId?` (required for zone pass types) and `child?: { name, age }` (age 1 to 17).
- `GET /ops/trips/:id` adds `stages: [{ stopId, seq, nameEn, nameTe, booked, boarded, alighting }]` and `passBoardings` (pass scans have no stop).
- Notification type `CHILD_BOARDED` with params `child`, `routeEn`, `routeTe`, `departureAt`.
- Search applies the service fit rule in docs/07 section 7b.
