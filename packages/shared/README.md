# packages/shared (`@aptransit/shared`)

The contract between web and API: zod schemas, enums, error codes, the status map and small pure helpers. Both devs own it; every change needs the other dev's review (AGENTS.md). Current state: `progress/handoff.md`.

## How it is built

- Compiled with `tsc` to CommonJS plus type declarations in `dist/` (decision D-005). Nest runs as CommonJS, Next bundles anything, so this works for both.
- Turbo builds it before `dev`, `build`, `lint`, `typecheck` and `test` of every other package. During `pnpm dev` it rebuilds on save.
- Stale types in your editor after a change: `pnpm --filter @aptransit/shared build`.

## Rules

- Only `zod` as a runtime dependency. No React, no Nest, no Node only APIs (the browser imports this too). Time zones through `Intl`.
- Everything is exported from `src/index.ts`.
- Every helper has tests next to it (`*.test.ts`, Vitest).
- No em dash or en dash, as everywhere.

## What is inside

| File | Exports |
| --- | --- |
| `src/enums.ts` | every enum from docs/05 as a zod enum plus its type: `Role`, `ServiceType`, `TicketStatus`, `ScanReason`, ... Use `TicketStatus.enum.ACTIVE` or the string literal |
| `src/errors.ts` | `ErrorCode` (const object), `ERROR_HTTP_STATUS`, `ErrorCodeSchema`, `ErrorResponse` (docs/06 error body), `isErrorCode()` |
| `src/status.ts` | `StatusTone`, `DisplayStatus`, `STATUS_MAP` (tone, lucide icon, i18n key), `deriveTripDisplayStatus()`, `busDisplayStatus()`, `TICKET_STATUS_MAP`, `ColourOfDay`, `colourOfDay(date)` (IST weekday) |
| `src/money.ts` | `Paise` schema, `isPaise`, `rupeesToPaise`, `paiseToRupees`, `roundToRupee` |
| `src/schemas/health.ts` | `HealthDto`, `ProbeState` |
| `src/fare.ts` | `calculateFare({ distanceKm, rule, isFreeTravel })` (per km with a minimum, nearest rupee, plus reservation fee), `refundQuote(...)` (docs/07 section 6 tiers, operator cancel, free tickets), `DEFAULT_REFUND_TIERS`, `FareRuleInput`, `RefundTier`. The only place fares are computed |
| `src/schemas/search.ts` | `PublicId`, `ServiceDateString` (real YYYY-MM-DD), `LocalTimeString` (HH:mm), `SearchTripsQuery`, `TripSummaryDto`, `SearchTripsResponse` |
| `src/schemas/network.ts` | `PlacesSearchQuery`, `PlaceDto`, `DistrictDto`, `BusStandDto`, `BusStandRouteDto`, `RouteDto` (ordered `stops`), `TimetableQuery`, `TimetableDto`, and array `...Response` schemas for the web client |

Planned next (see the day prompts): `codes.ts`, `polyline.ts`, `time.ts`, `permissions.ts` (Day 2), `schemas/auth.ts` and `messages/` (Day 3), `format.ts` (Day 5), `qr.ts` (Day 7).

## Adding a schema

```ts
// src/schemas/booking.ts
import { z } from "zod";

export const CreateBookingInput = z.object({
  tripId: z.string().min(1),
  passengers: z.array(z.object({ name: z.string().min(1), seatNo: z.string() })).min(1).max(6),
});
export type CreateBookingInput = z.infer<typeof CreateBookingInput>;
```

Then `export * from "./schemas/booking";` in `src/index.ts`. The API validates with it, the web types its forms with it, so a change breaks both builds at once (that is the point).

Naming: `<Thing>Input` for request bodies, `<Thing>Dto` for responses, `<Thing>Query` for query strings.

Added on Days 8 to 11: `schemas/passes.ts`, `schemas/notifications.ts`, `schemas/tracking.ts`, `countdown.ts`, `messages.ts` (the notification and email strings, built into `dist`), `notification-params.ts`, `normalizeRecipient` and `TransferTicketInput` in `schemas/tickets.ts`, `formatClock`.

## Day 12 contracts

Schemas in schemas/conductor.ts define validation input/result, conductor assignment and manifest counts. ALREADY_SCANNED can carry earlierScanAt. LiveTripDto includes hasOpenIncident and incidentTypes for accessible incident labels.

## Day 13 contracts

schemas/ops.ts provides strict request schemas and response DTOs for the operations API. ValidateTicketInput accepts either signed QR content or ticketNumber plus an eight-character liveCode; mixed inputs and code-only inputs are rejected. Validation context supplies reason-specific times and route details without secrets. ConductorTodayDto includes bilingual route names. SCAN_RESULT_MAP in status.ts owns scanner result tones, icons and translation keys. D-027 is approved; the other dev still reviews these shared changes.

## Day 14

Day 14 adds schemas/admin.ts for strict admin mutation inputs and validated responses. Ops DTOs include scoped depot/bus-type lookups, optional current fleet details and an inferred OpsTripDto type. INCIDENT_STATUS_MAP centralizes incident labels, icons and tones. Shared changes require the other dev review (D-029).
