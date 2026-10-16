import { z } from "zod";

// Every enum from docs/05-data-model.md. The Prisma schema mirrors these values exactly.

export const Role = z.enum([
  "CITIZEN",
  "DRIVER",
  "CONDUCTOR",
  "DEPOT_STAFF",
  "DEPOT_MANAGER",
  "DISTRICT_OFFICER",
  "TRANSPORT_OFFICER",
  "STATE_ADMIN",
  "SUPER_ADMIN",
]);
export type Role = z.infer<typeof Role>;

export const ServiceType = z.enum([
  "PALLEVELUGU",
  "ULTRA_PALLEVELUGU",
  "CITY_ORDINARY",
  "METRO_EXPRESS",
  "EXPRESS",
  "ULTRA_DELUXE",
  "SUPER_LUXURY",
  "INDRA_AC",
  "AMARAVATI_AC",
  "GARUDA_AC",
]);
export type ServiceType = z.infer<typeof ServiceType>;

/** D-042: services that stop in villages. A journey to or from a village stop lists only these. */
export const VILLAGE_SERVICE_TYPES = [
  "PALLEVELUGU",
  "ULTRA_PALLEVELUGU",
  "CITY_ORDINARY",
  "METRO_EXPRESS",
] as const satisfies readonly ServiceType[];

export const BusStatus = z.enum(["IDLE", "RUNNING", "DELAYED", "BREAKDOWN", "MAINTENANCE"]);
export type BusStatus = z.infer<typeof BusStatus>;

export const TripStatus = z.enum(["SCHEDULED", "RUNNING", "COMPLETED", "CANCELLED"]);
export type TripStatus = z.infer<typeof TripStatus>;

export const BookingStatus = z.enum(["PENDING_PAYMENT", "CONFIRMED", "EXPIRED", "CANCELLED"]);
export type BookingStatus = z.infer<typeof BookingStatus>;

export const TicketType = z.enum(["SINGLE", "FREE_TRAVEL"]);
export type TicketType = z.infer<typeof TicketType>;

export const TicketStatus = z.enum([
  "BOOKED",
  "ACTIVE",
  "SCANNED",
  "USED",
  "CANCELLED",
  "REFUNDED",
  "EXPIRED",
]);
export type TicketStatus = z.infer<typeof TicketStatus>;

export const PaymentStatus = z.enum([
  "CREATED",
  "CAPTURED",
  "FAILED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
]);
export type PaymentStatus = z.infer<typeof PaymentStatus>;

export const RefundStatus = z.enum(["PENDING", "PROCESSED", "FAILED"]);
export type RefundStatus = z.infer<typeof RefundStatus>;

export const PassKind = z.enum(["WEEKLY", "MONTHLY", "FREE_TRAVEL", "DAY", "FAMILY", "SCHOOL", "ANNUAL"]);
export type PassKind = z.infer<typeof PassKind>;

/** D-036: ROLLING_DAYS ends durationDays after activation, UNTIL_DAY_END at 23:59:59 IST of that day. */
export const PassValidityMode = z.enum(["ROLLING_DAYS", "UNTIL_DAY_END"]);
export type PassValidityMode = z.infer<typeof PassValidityMode>;

export const PassStatus = z.enum(["PENDING_PAYMENT", "READY", "ACTIVE", "EXPIRED", "CANCELLED"]);
export type PassStatus = z.infer<typeof PassStatus>;

export const ScanResult = z.enum(["VALID", "INVALID"]);
export type ScanResult = z.infer<typeof ScanResult>;

export const ScanReason = z.enum([
  "OK",
  "NOT_FOUND",
  "BAD_SIGNATURE",
  "STALE_CODE",
  "NOT_ACTIVATED",
  "ALREADY_SCANNED",
  "EXPIRED",
  "CANCELLED",
  "WRONG_TRIP",
  "WRONG_DATE",
  "SERVICE_NOT_ELIGIBLE",
  // D-035 segment and validity checks (docs/07 section 5, 10a to 11a)
  "PAST_DESTINATION",
  "BEFORE_BOARDING_STOP",
  "NOT_YET_VALID",
  "ROUTE_NOT_COVERED",
]);

/** Who verified a boarding (D-035). */
export const ValidatorKind = z.enum(["CONDUCTOR", "DOOR_SCANNER"]);
export type ValidatorKind = z.infer<typeof ValidatorKind>;

/** Where the boarding stop came from (D-035). NONE skips every stop check. */
export const StopSource = z.enum(["BUS_GPS", "DEVICE_GPS", "NONE"]);
export type StopSource = z.infer<typeof StopSource>;
export type ScanReason = z.infer<typeof ScanReason>;

export const IncidentType = z.enum([
  "BREAKDOWN",
  "ACCIDENT",
  "TRAFFIC",
  "ROAD_BLOCK",
  "BUS_PROBLEM",
  "MEDICAL",
  "DELAY",
  /** D-048: the crew pressed SOS. Always CRITICAL. */
  "SOS",
  "OTHER",
]);
export type IncidentType = z.infer<typeof IncidentType>;

export const IncidentStatus = z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED"]);
export type IncidentStatus = z.infer<typeof IncidentStatus>;

export const Severity = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type Severity = z.infer<typeof Severity>;

export const FeedbackCategory = z.enum([
  "DELAY",
  "CLEANLINESS",
  "STAFF",
  "TICKET",
  "SAFETY",
  "OVERCROWDING",
  "OTHER",
]);
export type FeedbackCategory = z.infer<typeof FeedbackCategory>;

export const ComplaintStatus = z.enum(["RECEIVED", "IN_REVIEW", "RESOLVED", "CLOSED"]);
export type ComplaintStatus = z.infer<typeof ComplaintStatus>;

export const NotificationType = z.enum([
  "BOOKING_CONFIRMED",
  "TICKET_ACTIVATED",
  "TICKET_RECEIVED",
  "TRIP_DEPARTED",
  "TRIP_DELAYED",
  "BUS_NEAR_STOP",
  "TRIP_CANCELLED",
  "REPLACEMENT_BUS",
  "ROUTE_UPDATE",
  "PASS_EXPIRING",
  "COMPLAINT_UPDATE",
  "CHILD_BOARDED",
]);
export type NotificationType = z.infer<typeof NotificationType>;

export const EligibilityScheme = z.enum(["STREE_SHAKTI", "STUDENT"]);
export type EligibilityScheme = z.infer<typeof EligibilityScheme>;

export const EligibilityResult = z.enum(["ELIGIBLE", "NOT_ELIGIBLE"]);
export type EligibilityResult = z.infer<typeof EligibilityResult>;

export const OtpChannel = z.enum(["EMAIL", "PHONE"]);
export type OtpChannel = z.infer<typeof OtpChannel>;

export const AssignmentReason = z.enum(["INITIAL", "REPLACEMENT"]);
export type AssignmentReason = z.infer<typeof AssignmentReason>;
