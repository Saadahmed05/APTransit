import { z } from "zod";
import { ScanReason, StopSource, TicketType } from "../enums";
import { PublicId } from "./search";
import { TripDto } from "./tracking";

/** The scanning device's own position, used for the boarding stop when the bus GPS is stale (D-035). */
export const ScanPosition = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracyM: z.number().nonnegative().max(10_000).optional(),
  })
  .strict();
export type ScanPosition = z.infer<typeof ScanPosition>;

const QrValidationInput = z
  .object({
    qr: z.string().min(1).max(4096),
    tripId: PublicId,
    deviceTime: z.string().datetime(),
    offline: z.literal(false).optional(),
    position: ScanPosition.optional(),
  })
  .strict();
export const ManualValidationInput = z
  .object({
    ticketNumber: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^APT-[0-9A-HJKMNP-Z]{4}-[0-9A-HJKMNP-Z]{4}$/),
    liveCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z2-7]{8}$/),
    tripId: PublicId,
    deviceTime: z.string().datetime(),
    offline: z.literal(false).optional(),
    position: ScanPosition.optional(),
  })
  .strict();
export const ValidateTicketInput = z.union([QrValidationInput, ManualValidationInput]);
export type ValidateTicketInput = z.infer<typeof ValidateTicketInput>;
const StopNames = z.object({ nameEn: z.string(), nameTe: z.string() });

export const ValidateTicketResult = z.object({
  result: z.enum(["VALID", "INVALID"]),
  reason: ScanReason,
  earlierScanAt: z.string().datetime().optional(),
  context: z
    .object({
      validUntil: z.string().datetime().nullable(),
      route: z.string().optional(),
      departureAt: z.string().datetime().optional(),
      serviceDate: z.string().optional(),
      services: z.array(z.string()).optional(),
      /** Pass: first valid moment (NOT_YET_VALID). */
      validFrom: z.string().datetime().nullable().optional(),
      /** Ticket: its own boarding and dropping stops (BEFORE_BOARDING_STOP, PAST_DESTINATION). */
      ticketFrom: StopNames.optional(),
      ticketTo: StopNames.optional(),
      /** Where the bus is, from bus or device GPS; null when unknown (D-035). */
      boardingStop: z
        .object({ stopId: z.string(), nameEn: z.string(), nameTe: z.string(), source: StopSource })
        .nullable()
        .optional(),
    })
    .optional(),
  /** Group passes (D-036): VALID boardings on this trip so far, including this one, of size. */
  group: z.object({ boarded: z.number().int().nonnegative(), size: z.number().int().positive() }).optional(),
  ticket: z
    .object({
      passengerName: z.string(),
      seatNo: z.string().nullable(),
      routeName: z.string(),
      boarding: z.string(),
      dropping: z.string(),
      type: z.union([TicketType, z.literal("PASS")]),
    })
    .optional(),
});
export type ValidateTicketResult = z.infer<typeof ValidateTicketResult>;
export const ManifestCounts = z.object({
  passengers: z.number().int().nonnegative(),
  checked: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
});
export const ConductorManifestDto = z.object({
  counts: ManifestCounts,
  seats: z.array(
    z.object({ seatNo: z.string().nullable(), state: z.enum(["CHECKED", "PENDING"]) }),
  ),
});
export type ConductorManifestDto = z.infer<typeof ConductorManifestDto>;
export const ConductorTodayDto = z.object({
  trip: TripDto.nullable(),
  counts: ManifestCounts,
  route: z.object({ nameEn: z.string(), nameTe: z.string() }).nullable().default(null),
});
export type ConductorTodayDto = z.infer<typeof ConductorTodayDto>;
