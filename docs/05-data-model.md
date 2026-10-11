# 05 · Data model

**Status: LOCKED.** Source: plan sec 57, 68, 69, 70. Owner: Dev B. Dev B writes `apps/api/prisma/schema.prisma` from this doc on Day 2.

## Conventions

- Table names `snake_case` plural via `@@map`. Prisma models `PascalCase` singular.
- Primary keys: `id String @id @default(cuid(2))`. Exception: `gps_locations` uses `BigInt @default(autoincrement())`.
- Every table has `createdAt`. Mutable tables also have `updatedAt`.
- Money: `Int` paise, field names end with `Paise`.
- Time: `DateTime` in UTC. Local clock values (timetable departure) stored as `String` `"HH:mm"` in `Asia/Kolkata`.
- Bilingual names: `nameEn`, `nameTe`.
- Human readable codes are unique and indexed: tickets `APT-XXXX-XXXX`, bookings `BKG-XXXXXX`, passes `PAS-XXXXXX`, complaints `CMP-XXXXXX`, incidents `INC-XXXXXX` (Crockford base32, no I, L, O, U).
- Soft delete only for `users` (`deletedAt`). Everything else is status driven.

## Enums

| Enum | Values |
| --- | --- |
| Role | CITIZEN, DRIVER, CONDUCTOR, DEPOT_STAFF, DEPOT_MANAGER, DISTRICT_OFFICER, TRANSPORT_OFFICER, STATE_ADMIN, SUPER_ADMIN |
| ServiceType | PALLEVELUGU, ULTRA_PALLEVELUGU, CITY_ORDINARY, METRO_EXPRESS, EXPRESS, ULTRA_DELUXE, SUPER_LUXURY, INDRA_AC, AMARAVATI_AC, GARUDA_AC |
| BusStatus | IDLE, RUNNING, DELAYED, BREAKDOWN, MAINTENANCE |
| TripStatus | SCHEDULED, RUNNING, COMPLETED, CANCELLED |
| BookingStatus | PENDING_PAYMENT, CONFIRMED, EXPIRED, CANCELLED |
| TicketType | SINGLE, FREE_TRAVEL |
| TicketStatus | BOOKED, ACTIVE, SCANNED, USED, CANCELLED, REFUNDED, EXPIRED |
| PaymentStatus | CREATED, CAPTURED, FAILED, REFUNDED, PARTIALLY_REFUNDED |
| RefundStatus | PENDING, PROCESSED, FAILED |
| PassKind | WEEKLY, MONTHLY, FREE_TRAVEL, DAY, FAMILY, SCHOOL, ANNUAL (last four D-036) |
| PassValidityMode | ROLLING_DAYS, UNTIL_DAY_END (D-036) |
| PassStatus | PENDING_PAYMENT, READY, ACTIVE, EXPIRED, CANCELLED |
| ScanResult | VALID, INVALID |
| ScanReason | OK, NOT_FOUND, BAD_SIGNATURE, STALE_CODE, NOT_ACTIVATED, ALREADY_SCANNED, EXPIRED, CANCELLED, WRONG_TRIP, WRONG_DATE, SERVICE_NOT_ELIGIBLE, PAST_DESTINATION, BEFORE_BOARDING_STOP, NOT_YET_VALID, ROUTE_NOT_COVERED (last four D-035) |
| ValidatorKind | CONDUCTOR, DOOR_SCANNER (D-035) |
| StopSource | BUS_GPS, DEVICE_GPS, NONE (D-035) |
| IncidentType | BREAKDOWN, ACCIDENT, TRAFFIC, ROAD_BLOCK, BUS_PROBLEM, MEDICAL, DELAY, OTHER |
| IncidentStatus | OPEN, ACKNOWLEDGED, RESOLVED |
| Severity | LOW, MEDIUM, HIGH, CRITICAL |
| FeedbackCategory | DELAY, CLEANLINESS, STAFF, TICKET, SAFETY, OVERCROWDING, OTHER |
| ComplaintStatus | RECEIVED, IN_REVIEW, RESOLVED, CLOSED |
| NotificationType | BOOKING_CONFIRMED, TICKET_ACTIVATED, TICKET_RECEIVED, TRIP_DEPARTED, TRIP_DELAYED, BUS_NEAR_STOP, TRIP_CANCELLED, REPLACEMENT_BUS, ROUTE_UPDATE, PASS_EXPIRING, COMPLAINT_UPDATE, CHILD_BOARDED (D-042) |
| EligibilityScheme | STREE_SHAKTI, STUDENT (D-036) |
| EligibilityResult | ELIGIBLE, NOT_ELIGIBLE |
| OtpChannel | EMAIL, PHONE |
| AssignmentReason | INITIAL, REPLACEMENT |

## Tables

### Identity

| Table | Fields | Notes |
| --- | --- | --- |
| users | id, phone?, email?, name?, preferredLocale (`en` or `te`), createdAt, updatedAt, deletedAt? | phone and email each unique when present. At least one required |
| user_roles | id, userId, role, depotId?, districtId?, stateId? | Scope: depot roles need depotId, district roles need districtId, STATE_ADMIN and TRANSPORT_OFFICER need stateId (D-034). SUPER_ADMIN has no scope (every state). Unique (userId, role, depotId, districtId) |
| otp_codes | id, channel, target, codeHash, purpose (`LOGIN`), attempts, expiresAt, consumedAt? | Code hashed with SHA 256 + `OTP_PEPPER`. TTL 5 min. Max 5 attempts |
| refresh_tokens | id, userId, tokenHash, familyId, expiresAt, revokedAt?, replacedById?, userAgent?, createdAt | Rotation with reuse detection: reuse revokes the whole family |
| devices | id, userId, label, deviceKeyHash, approvedAt?, approvedById?, revokedAt? | Only approved devices of the assigned driver may send GPS (sec 62) |

### Network

The network is State > District > Depot > Route > Bus > Trip (D-034). A new state is data: a `states` row plus its districts, never a code change.

| Table | Fields | Notes |
| --- | --- | --- |
| states | id, code (`AP`, `TG`), nameEn, nameTe, timezone (default `Asia/Kolkata`), codePrefix, minLat, minLng, maxLat, maxLng, centerLat, centerLng, defaultZoom (7), isActive | AP has the fixed id `stateap000000000000000000` (backfill migration and seed agree). Bounds drive the GPS trust box (docs/12) and the maps. The platform has one time zone (`PLATFORM_TIME_ZONE` in packages/shared time.ts); a state whose zone differs is refused. `codePrefix` is for new depot, route and stop codes; the `APT-` ticket and `APT1` QR prefixes stay platform wide |
| districts | id, code, nameEn, nameTe, stateId | Seed: see [19-seed-data.md](19-seed-data.md). Index (stateId) |
| bus_stands | id, code, nameEn, nameTe, districtId, lat, lng | |
| depots | id, code, nameEn, nameTe, districtId, busStandId | |
| stops | id, code, nameEn, nameTe, districtId, busStandId?, lat, lng | A bus stand is also a stop |
| routes | id, code, nameEn, nameTe, originStopId, destinationStopId, distanceKm, polyline (encoded), depotId, isActive | Example code `KNL-VJA-01` |
| route_stops | id, routeId, stopId, seq, kmFromOrigin, minutesFromOrigin, isBoarding, isDropping | Unique (routeId, seq) and (routeId, stopId) |
| timetables | id, routeId, busTypeId, departureLocal (`"06:30"`), daysMask (Mon bit 0 to Sun bit 6), validFrom, validTo?, isActive | One row per scheduled departure |

### Fleet and staff

| Table | Fields | Notes |
| --- | --- | --- |
| bus_types | id, serviceType (unique), nameEn, nameTe, isAc, totalSeats, seatLayout (JSON), freeTravelEligible | Layout JSON: rows, columns, aisle index, seat labels, blocked cells |
| buses | id, regNo (unique), busTypeId, depotId, status, maintenanceDueAt?, odometerKm | Reg format `AP 39 Z 1234` |
| drivers | id, userId (unique), depotId, employeeCode, licenseNo | |
| conductors | id, userId (unique), depotId, employeeCode | |
| maintenance_records | id, busId, kind, note?, startAt, endAt? | |

### Operations

| Table | Fields | Notes |
| --- | --- | --- |
| trips | id, code, timetableId, routeId, busTypeId, serviceDate (date), scheduledDepartureAt, scheduledArrivalAt, actualDepartureAt?, actualArrivalAt?, status, delayMinutes (default 0), lastStopSeq?, hasOpenIncident | Generated from timetables 7 days ahead by a daily job |
| trip_assignments | id, tripId, busId, driverId, conductorId?, reason, assignedById, startedAt, endedAt? | Current assignment = row with `endedAt` null. Replacement ends the old row and adds a new one |
| gps_locations | id (BigInt), tripId, busId, lat, lng, speedKmh?, headingDeg?, accuracyM?, recordedAt, receivedAt | Sampled every 30 s. Raw rows deleted after 30 days (sec 70) |
| incidents | id, code, type, severity, status, tripId, busId, reportedById, lat, lng, note?, createdAt, acknowledgedAt?, acknowledgedById?, resolvedAt?, resolutionNote? | GPS, bus and trip filled by the server, not the client (sec 33) |

### Booking and tickets

| Table | Fields | Notes |
| --- | --- | --- |
| bookings | id, code, userId, tripId, boardingStopId, droppingStopId, status, totalPaise, holdExpiresAt, createdAt, updatedAt | |
| booking_passengers | id, bookingId, name, age, gender (`F`, `M`, `X`), seatNo | Gender only for seat rules and free travel, never shown to other users |
| tickets | id, code, bookingId?, passengerId?, type, status, holderUserId, originalUserId, tripId, routeId, boardingStopId, droppingStopId, seatNo?, farePaise, activatedAt?, validUntil?, scannedAt?, usedAt?, expiresAt, qrSecret (encrypted), giftable, transferCount, version, createdAt, updatedAt | `version` for optimistic locking on every status change. See [07](07-ticket-and-pass-rules.md) |
| ticket_scans | id, ticketId?, passId?, tripId, conductorId?, result, reason, scannedAt, deviceTime?, offline, busId?, stopId?, stopSource (default NONE), lat?, lng?, deviceId?, validatorKind (default CONDUCTOR) | Every scan attempt is saved, valid or not. A VALID row is the boarding record: bus, stop, time, location and who or what verified it (D-035). conductorId is null for a door scanner (P5). Indexes (stopId, scannedAt), (busId, scannedAt). Old rows were backfilled with CONDUCTOR and the bus assigned at scan time |
| ticket_transfers | id, ticketId, fromUserId, toUserId, createdAt | Only successful transfers are rows. Failed attempts are in audit_logs |

### Passes and money

| Table | Fields | Notes |
| --- | --- | --- |
| pass_types | id, kind, nameEn, nameTe, durationDays, validityMode (default ROLLING_DAYS), pricePaise, eligibleServiceTypes (ServiceType[]), scheme?, groupSize (default 1), routeRestricted (default false), isDemo (default false), sortOrder, zoneScoped (D-042), isActive, stateId? | FREE_TRAVEL has pricePaise 0 and scheme STREE_SHAKTI. SCHOOL has scheme STUDENT and routeRestricted. FAMILY has groupSize 4. isDemo marks a placeholder price (D-036). stateId null means sold in every state |
| passes | id, code, userId, passTypeId, status, pricePaise, durationDays, validityMode, eligibleServiceTypes, groupSize, homeStopId?, destStopId?, activatedAt?, validFrom?, validUntil?, eligibilityCheckId?, paymentId?, qrSecret (encrypted), zoneDistrictId?, holderName?, holderAge? (D-042, migration 20261011000000_v3_passes_children), createdAt | holderName and holderAge make a child card: the owner (parent) gets CHILD_BOARDED on each valid scan. zoneDistrictId limits a zoneScoped pass to one district. Never giftable. Price, duration, mode, services and group size are copied from the type at purchase, so a later pass type edit never changes a sold pass (D-036). homeStopId and destStopId are set for route restricted passes (SCHOOL) |
| eligibility_checks | id, userId, scheme, provider, result, reasonCode?, providerRef, checkedAt, expiresAt | Stores the **result only**. No Aadhaar number, no document image (sec 51) |
| payments | id, bookingId?, passId?, provider (`RAZORPAY`), providerOrderId (unique), providerPaymentId? (unique), amountPaise, status, capturedAt?, raw (JSON, redacted), createdAt | Exactly one of bookingId or passId |
| refunds | id, paymentId, ticketId?, amountPaise, status, providerRefundId?, policyId, reason, createdAt, processedAt? | |
| fare_rules | id, busTypeId, baseFarePaise, perKmPaise, minFarePaise, reservationFeePaise, validFrom, validTo? | Fare math lives in `packages/shared/src/fare.ts` |
| refund_policies | id, name, tiers (JSON: `[{ minHoursBefore, percent }]`), cancellationFeePaise, isActive, validFrom | Admin editable (sec 53) |
| settings | key (PK), value (JSON), updatedById, updatedAt | Activation window, gifting cutoff, hold minutes. Defaults in [07](07-ticket-and-pass-rules.md) |

### Engagement and records

| Table | Fields | Notes |
| --- | --- | --- |
| notifications | id, userId, type, params (JSON), link?, readAt?, emailedAt?, createdAt | Text is rendered from i18n keys `notifications.<type>.title` and `.body` in the user locale |
| complaints | id, code, userId?, email, category, message, ticketCode?, busRegNo?, routeCode?, travelDate?, status, depotId?, assignedToId?, resolutionNote?, resolvedAt?, createdAt, updatedAt | Feedback and complaints are one table. Every submission gets a code (sec 41) |
| daily_stats | id, date, stateId?, districtId?, depotId?, routeId?, tripsScheduled, tripsCompleted, tripsCancelled, avgDelayMin, onTimePct, passengers, ticketsSold, passesActive, revenuePaise, incidents, complaints | Rollup job at 00:15 IST, plus live numbers for today from queries. Every row has its stateId; one state row per active state (no district, depot or route). Complaints without a depot and passes of a type without a state count in every state row |
| audit_logs | id, actorUserId?, actorRole?, action, entityType, entityId, before (JSON)?, after (JSON)?, ip?, userAgent?, createdAt | Append only. See audit events in [12-security.md](12-security.md) |

## Indexes (minimum)

- districts: (stateId)
- daily_stats: (date, routeId), (date, stateId)
- trips: (routeId, serviceDate), (serviceDate, status)
- route_stops: (stopId)
- tickets: (holderUserId, status), (tripId, status). Seat uniqueness per trip is enforced in the booking transaction plus the Redis hold
- bookings: (userId, createdAt desc)
- gps_locations: (tripId, recordedAt desc)
- incidents: (status, createdAt desc)
- complaints: (status, createdAt desc)
- audit_logs: (entityType, entityId), (actorUserId, createdAt desc)
- stops: (nameEn), (nameTe) for prefix search

## Seat rule (MVP)

A seat is taken for the whole trip, not per segment. Taken means: a ticket on that trip with status BOOKED, ACTIVE, SCANNED or USED, or a live Redis hold. Segment reuse is Phase 2.

## Mapping to plan sec 15 (ticket status)

| Plan status | Our model |
| --- | --- |
| Created, Paid | `bookings.status` PENDING_PAYMENT, then CONFIRMED. No ticket exists before payment is verified (sec 52) |
| Booked | `tickets.status` BOOKED |
| Activated, Valid | ACTIVE. "Valid" is derived: ACTIVE and now is before `validUntil` |
| Scanned | SCANNED |
| Used | USED (set when the trip completes, or at `validUntil` after a scan) |
| Cancelled, Expired, Refunded | CANCELLED, EXPIRED, REFUNDED |

## Retention jobs

| Data | Keep |
| --- | --- |
| gps_locations raw | 30 days, then deleted (daily job) |
| otp_codes | 24 hours |
| refresh_tokens expired or revoked | 30 days |
| notifications | 90 days |
| audit_logs, payments, refunds, tickets, ticket_scans | Kept. Final period decided by the authority ([18](18-open-decisions.md)) |
