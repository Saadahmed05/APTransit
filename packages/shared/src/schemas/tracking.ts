import { z } from "zod";
import { IncidentStatus, IncidentType, Severity, TripStatus } from "../enums";
import { DisplayStatus } from "../status";
import { PublicId } from "./search";

// docs/06 "Driver, tracking, conductor" and "WebSocket", docs/13. Day 11.

/** The device key travels in this header with every ping (docs/12 GPS trust). */
export const DEVICE_KEY_HEADER = "x-device-key";

export const RegisterDeviceInput = z.object({ label: z.string().trim().min(1).max(60) }).strict();
export type RegisterDeviceInput = z.infer<typeof RegisterDeviceInput>;

/** The key is shown once; the server keeps only its hash. */
export const RegisterDeviceResult = z.object({ deviceId: z.string(), deviceKey: z.string() });
export type RegisterDeviceResult = z.infer<typeof RegisterDeviceResult>;

export const DriverStopDto = z.object({
  stopId: z.string(),
  seq: z.number().int(),
  nameEn: z.string(),
  nameTe: z.string(),
  lat: z.number(),
  lng: z.number(),
  kmFromOrigin: z.number(),
  minutesFromOrigin: z.number().int(),
});
export type DriverStopDto = z.infer<typeof DriverStopDto>;

export const TripDto = z.object({
  id: z.string(),
  code: z.string(),
  status: TripStatus,
  displayStatus: DisplayStatus,
  serviceDate: z.string(),
  scheduledDepartureAt: z.string().datetime(),
  scheduledArrivalAt: z.string().datetime(),
  actualDepartureAt: z.string().datetime().nullable(),
  actualArrivalAt: z.string().datetime().nullable(),
  delayMinutes: z.number().int().nonnegative(),
});
export type TripDto = z.infer<typeof TripDto>;

/** GET /driver/today: the current or next assignment today, and the device state. */
export const DriverTodayDto = z.object({
  driverName: z.string().nullable(),
  assignment: z.object({ id: z.string() }).nullable(),
  trip: TripDto.nullable(),
  bus: z.object({ id: z.string(), regNo: z.string() }).nullable(),
  route: z
    .object({ id: z.string(), code: z.string(), nameEn: z.string(), nameTe: z.string(), distanceKm: z.number(), polyline: z.string() })
    .nullable(),
  stops: z.array(DriverStopDto),
  /** Start trip is allowed from this moment (60 min before departure). */
  startableFrom: z.string().datetime().nullable(),
  deviceRegistered: z.boolean(),
  deviceApproved: z.boolean(),
  /** The phone that asked (X-Device-Key): approved, waiting, or null when it sent no key or an unknown one. */
  thisDevice: z.enum(["APPROVED", "PENDING"]).nullable(),
});
export type DriverTodayDto = z.infer<typeof DriverTodayDto>;

/** India plus margin: the API checks the tighter AP box (docs/12). */
export const GpsPointInput = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  speedKmh: z.number().min(0).max(300).optional(),
  headingDeg: z.number().min(0).max(360).optional(),
  accuracyM: z.number().min(0).max(100_000).optional(),
  recordedAt: z.string().datetime(),
});
export type GpsPointInput = z.infer<typeof GpsPointInput>;

/** POST /tracking/ping: 1 to 20 points. */
export const TrackingPingInput = z.object({
  tripId: PublicId,
  points: z.array(GpsPointInput).min(1).max(20),
});
export type TrackingPingInput = z.infer<typeof TrackingPingInput>;

export const StopProgressState = z.enum(["DONE", "CURRENT", "UPCOMING"]);
export type StopProgressState = z.infer<typeof StopProgressState>;

export const LivePositionDto = z.object({
  lat: z.number(),
  lng: z.number(),
  speedKmh: z.number().nullable(),
  headingDeg: z.number().nullable(),
  recordedAt: z.string().datetime(),
});
export type LivePositionDto = z.infer<typeof LivePositionDto>;

/** GET /tracking/trips/:id/live (public). */
export const LiveTripDto = z.object({
  tripId: z.string(),
  status: TripStatus,
  displayStatus: DisplayStatus,
  position: LivePositionDto.nullable(),
  nextStop: z.object({ stopId: z.string(), seq: z.number().int(), nameEn: z.string(), nameTe: z.string() }).nullable(),
  etaNextStopSec: z.number().int().nonnegative().nullable(),
  delayMinutes: z.number().int().nonnegative(),
  progressPct: z.number().min(0).max(100),
  hasOpenIncident: z.boolean().default(false),
  incidentTypes: z.array(IncidentType).default([]),
  progress: z.array(
    z.object({
      stopId: z.string(),
      seq: z.number().int(),
      nameEn: z.string(),
      nameTe: z.string(),
      state: StopProgressState,
      etaAt: z.string().datetime().nullable(),
    }),
  ),
});
export type LiveTripDto = z.infer<typeof LiveTripDto>;

export const LiveTrackingQuery = z.object({
  depotId: PublicId.optional(),
  districtId: PublicId.optional(),
});
export type LiveTrackingQuery = z.infer<typeof LiveTrackingQuery>;

/** GET /tracking/live (ops roles): one running bus. */
export const LiveBusDto = z.object({
  tripId: z.string(),
  tripCode: z.string(),
  busId: z.string(),
  busRegNo: z.string(),
  routeId: z.string(),
  routeCode: z.string(),
  depotId: z.string(),
  lat: z.number(),
  lng: z.number(),
  speedKmh: z.number().nullable(),
  headingDeg: z.number().nullable(),
  recordedAt: z.string().datetime(),
  delayMinutes: z.number().int().nonnegative(),
  displayStatus: DisplayStatus,
  progressPct: z.number().min(0).max(100),
  nextStopId: z.string().nullable(),
});
export type LiveBusDto = z.infer<typeof LiveBusDto>;

/** POST /driver/incidents. The server fills trip, bus and location (never the client). */
export const DriverIncidentInput = z
  .object({
    type: IncidentType,
    severity: Severity.optional(),
    note: z.string().trim().max(280).optional(),
  })
  .strict();
export type DriverIncidentInput = z.infer<typeof DriverIncidentInput>;

export const IncidentDto = z.object({
  busRegNo: z.string().optional(),
  tripCode: z.string().optional(),
  id: z.string(),
  code: z.string(),
  type: IncidentType,
  severity: Severity,
  status: IncidentStatus,
  tripId: z.string(),
  busId: z.string(),
  lat: z.number(),
  lng: z.number(),
  note: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type IncidentDto = z.infer<typeof IncidentDto>;

/** Socket.IO `bus:position` payload (docs/06 WebSocket). */
export const BusPositionEvent = z.object({
  tripId: z.string(),
  busId: z.string(),
  lat: z.number(),
  lng: z.number(),
  speedKmh: z.number().nullable(),
  headingDeg: z.number().nullable(),
  recordedAt: z.string().datetime(),
  nextStopId: z.string().nullable(),
  etaNextStopSec: z.number().int().nonnegative().nullable(),
  delayMinutes: z.number().int().nonnegative(),
  progressPct: z.number().min(0).max(100),
});
export type BusPositionEvent = z.infer<typeof BusPositionEvent>;

/** Socket.IO `trip:status` payload. */
export const TripStatusEvent = z.object({
  tripId: z.string(),
  status: TripStatus,
  displayStatus: DisplayStatus,
  delayMinutes: z.number().int().nonnegative(),
  lastStopSeq: z.number().int().nullable(),
});
export type TripStatusEvent = z.infer<typeof TripStatusEvent>;

/** Rooms a client may ask for: trip:<id>, route:<id>, depot:<id>, district:<id>, state:<id> (D-034). */
export const LiveRoom = z.string().regex(/^(?:trip|route|depot|district|state):[a-z0-9]{8,40}$/);
export const SubscribeInput = z.object({ room: LiveRoom });
export type SubscribeInput = z.infer<typeof SubscribeInput>;

/** GET /driver/trips: the driver's assignments today (the simulator's --all uses it). */
export const DriverTripSummaryDto = z.object({
  tripId: z.string(),
  code: z.string(),
  status: TripStatus,
  routeId: z.string(),
  routeCode: z.string(),
  depotCode: z.string(),
  scheduledDepartureAt: z.string().datetime(),
  scheduledArrivalAt: z.string().datetime(),
});
export type DriverTripSummaryDto = z.infer<typeof DriverTripSummaryDto>;
