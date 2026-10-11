import { z } from "zod";
import type { BusStatus, TicketStatus, TripStatus, IncidentStatus } from "./enums";
import { PLATFORM_TIME_ZONE } from "./time";

// One status system for the whole product. Source: docs/09-design-system.md (Status tones, Status labels)
// and docs/07-ticket-and-pass-rules.md section 3. Colour is never the only signal: every status has
// a label (i18nKey) and an icon (lucide name).

export const StatusTone = z.enum(["success", "info", "warning", "danger", "maintenance", "neutral"]);
export type StatusTone = z.infer<typeof StatusTone>;

export const DisplayStatus = z.enum([
  "UPCOMING",
  "RUNNING",
  "DELAYED",
  "COMPLETED",
  "CANCELLED",
  "INCIDENT",
  "BREAKDOWN",
  "MAINTENANCE",
  "NOT_ASSIGNED",
]);
export type DisplayStatus = z.infer<typeof DisplayStatus>;

export interface StatusMeta {
  key: string;
  tone: StatusTone;
  /** lucide-react icon name in kebab case */
  icon: string;
  i18nKey: string;
}

export const INCIDENT_STATUS_MAP: Record<IncidentStatus, StatusMeta> = {
  OPEN: { key: "OPEN", tone: "warning", icon: "triangle-alert", i18nKey: "opsApp.incidentStatus.OPEN" },
  ACKNOWLEDGED: { key: "ACKNOWLEDGED", tone: "info", icon: "clock", i18nKey: "opsApp.incidentStatus.ACKNOWLEDGED" },
  RESOLVED: { key: "RESOLVED", tone: "success", icon: "circle-check", i18nKey: "opsApp.incidentStatus.RESOLVED" },
};

export const STATUS_MAP: Record<DisplayStatus, StatusMeta> = {
  UPCOMING: { key: "UPCOMING", tone: "neutral", icon: "clock", i18nKey: "status.UPCOMING" },
  RUNNING: { key: "RUNNING", tone: "info", icon: "bus", i18nKey: "status.RUNNING" },
  DELAYED: { key: "DELAYED", tone: "warning", icon: "timer", i18nKey: "status.DELAYED" },
  COMPLETED: { key: "COMPLETED", tone: "success", icon: "circle-check", i18nKey: "status.COMPLETED" },
  CANCELLED: { key: "CANCELLED", tone: "danger", icon: "circle-x", i18nKey: "status.CANCELLED" },
  INCIDENT: { key: "INCIDENT", tone: "danger", icon: "triangle-alert", i18nKey: "status.INCIDENT" },
  BREAKDOWN: { key: "BREAKDOWN", tone: "danger", icon: "wrench", i18nKey: "status.BREAKDOWN" },
  MAINTENANCE: {
    key: "MAINTENANCE",
    tone: "maintenance",
    icon: "settings",
    i18nKey: "status.MAINTENANCE",
  },
  NOT_ASSIGNED: {
    key: "NOT_ASSIGNED",
    tone: "neutral",
    icon: "circle-dashed",
    i18nKey: "status.NOT_ASSIGNED",
  },
};

/** A trip counts as delayed for display at this many minutes or more (docs/13, step 4). */
export const DELAY_DISPLAY_THRESHOLD_MIN = 5;

export interface TripStatusInput {
  status: TripStatus;
  hasOpenIncident: boolean;
  delayMinutes: number;
}

/**
 * Priority order from docs/09: CANCELLED wins, then INCIDENT when there is an open incident,
 * then COMPLETED, then DELAYED at 5 minutes or more, then RUNNING, else UPCOMING.
 */
export function deriveTripDisplayStatus(trip: TripStatusInput): DisplayStatus {
  if (trip.status === "CANCELLED") return "CANCELLED";
  if (trip.hasOpenIncident) return "INCIDENT";
  if (trip.status === "COMPLETED") return "COMPLETED";
  if (trip.delayMinutes >= DELAY_DISPLAY_THRESHOLD_MIN) return "DELAYED";
  if (trip.status === "RUNNING") return "RUNNING";
  return "UPCOMING";
}

const BUS_DISPLAY: Record<BusStatus, DisplayStatus> = {
  IDLE: "NOT_ASSIGNED",
  RUNNING: "RUNNING",
  DELAYED: "DELAYED",
  BREAKDOWN: "BREAKDOWN",
  MAINTENANCE: "MAINTENANCE",
};

/** Bus status colours for the depot dashboard (plan sec 29, resolved in docs/09). */
export function busDisplayStatus(status: BusStatus): DisplayStatus {
  return BUS_DISPLAY[status];
}

/** Citizen facing ticket labels and tones (docs/07 section 3). */
export const TICKET_STATUS_MAP: Record<TicketStatus, { tone: StatusTone; i18nKey: string; icon: string }> = {
  BOOKED: { tone: "neutral", i18nKey: "ticketStatus.BOOKED", icon: "circle-dashed" },
  ACTIVE: { tone: "info", i18nKey: "ticketStatus.ACTIVE", icon: "timer" },
  SCANNED: { tone: "success", i18nKey: "ticketStatus.SCANNED", icon: "circle-check" },
  USED: { tone: "neutral", i18nKey: "ticketStatus.USED", icon: "circle-check" },
  CANCELLED: { tone: "danger", i18nKey: "ticketStatus.CANCELLED", icon: "circle-x" },
  REFUNDED: { tone: "neutral", i18nKey: "ticketStatus.REFUNDED", icon: "circle-x" },
  EXPIRED: { tone: "neutral", i18nKey: "ticketStatus.EXPIRED", icon: "clock" },
};

export const ColourOfDay = z.enum(["RED", "BLUE", "GREEN", "VIOLET", "AMBER", "TEAL", "PINK"]);
export const SCAN_RESULT_MAP = {
  VALID: {tone:"success",icon:"circle-check",i18nKey:"scan.valid"},
  INVALID: {tone:"danger",icon:"circle-x",i18nKey:"scan.invalid"},
} as const;
export type ColourOfDay = z.infer<typeof ColourOfDay>;

/** Index 0 is Sunday, matching the IST weekday. CSS tokens live in packages/ui tokens.css. */
const COLOUR_BY_WEEKDAY: readonly { key: ColourOfDay; cssVar: string; i18nKey: string }[] = [
  { key: "RED", cssVar: "--day-sun", i18nKey: "colourOfDay.RED" },
  { key: "BLUE", cssVar: "--day-mon", i18nKey: "colourOfDay.BLUE" },
  { key: "GREEN", cssVar: "--day-tue", i18nKey: "colourOfDay.GREEN" },
  { key: "VIOLET", cssVar: "--day-wed", i18nKey: "colourOfDay.VIOLET" },
  { key: "AMBER", cssVar: "--day-thu", i18nKey: "colourOfDay.AMBER" },
  { key: "TEAL", cssVar: "--day-fri", i18nKey: "colourOfDay.TEAL" },
  { key: "PINK", cssVar: "--day-sat", i18nKey: "colourOfDay.PINK" },
];

const IST_WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: PLATFORM_TIME_ZONE });
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Colour of the day for ticket anti fraud, based on the weekday in IST. */
export function colourOfDay(date: Date) {
  const weekday = WEEKDAY_INDEX[IST_WEEKDAY.format(date)];
  if (weekday === undefined) throw new Error("Could not resolve IST weekday");
  const entry = COLOUR_BY_WEEKDAY[weekday];
  if (!entry) throw new Error("Colour of the day table is incomplete");
  return entry;
}
