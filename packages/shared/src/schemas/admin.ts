import { z } from "zod";
import { Role } from "../enums";
import { PublicId, ServiceDateString } from "./search";

const name = z.string().trim().min(1).max(120);
const iso = z.string().datetime();
const dateWindow = { validFrom: iso, validTo: iso.nullable().optional() };
export const AdminQuery = z
  .object({
    q: z.string().trim().max(120).optional(),
    role: Role.optional(),
    cursor: PublicId.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    entityType: z.string().max(60).optional(),
    entityId: z.string().min(1).max(120).optional(),
    actorId: PublicId.optional(),
    from: iso.optional(),
    to: iso.optional(),
  })
  .strict();
export type AdminQuery = z.infer<typeof AdminQuery>;
export const AdminStopInput = z
  .object({
    code: z.string().trim().min(2).max(32),
    nameEn: name,
    nameTe: name,
    districtId: PublicId,
    busStandId: PublicId.nullable().optional(),
    lat: z.number().min(12.15).max(20.4),
    lng: z.number().min(76.2).max(85.3),
  })
  .strict();
export const AdminStopPatch = AdminStopInput.partial();
export type AdminStopInput = z.infer<typeof AdminStopInput>;
export type AdminStopPatch = z.infer<typeof AdminStopPatch>;
export const AdminStopDto = AdminStopInput.safeExtend({ id: PublicId }).strip();
export type AdminStopDto = z.infer<typeof AdminStopDto>;

export const AdminRouteStop = z
  .object({
    stopId: PublicId,
    kmFromOrigin: z.number().nonnegative(),
    minutesFromOrigin: z.number().int().nonnegative(),
    isBoarding: z.boolean(),
    isDropping: z.boolean(),
  })
  .strict();
export type AdminRouteStop = z.infer<typeof AdminRouteStop>;
const orderedStops = z
  .array(AdminRouteStop)
  .min(2)
  .max(100)
  .superRefine((rows, ctx) => {
    if (new Set(rows.map((r) => r.stopId)).size !== rows.length)
      ctx.addIssue({ code: "custom", message: "Duplicate stops" });
    if (rows[0]?.kmFromOrigin !== 0 || rows[0]?.minutesFromOrigin !== 0)
      ctx.addIssue({ code: "custom", message: "Origin must start at zero" });
    rows.forEach((row, i) => {
      if (
        i &&
        (row.kmFromOrigin <= rows[i - 1]!.kmFromOrigin ||
          row.minutesFromOrigin <= rows[i - 1]!.minutesFromOrigin)
      )
        ctx.addIssue({
          code: "custom",
          path: [i],
          message: "Distances and minutes must increase strictly",
        });
    });
  });
export const AdminRouteInput = z
  .object({
    code: z.string().trim().min(2).max(32),
    nameEn: name,
    nameTe: name,
    depotId: PublicId,
    isActive: z.boolean().default(true),
    stops: orderedStops,
  })
  .strict();
export const AdminRoutePatch = AdminRouteInput.partial();
export type AdminRouteInput = z.infer<typeof AdminRouteInput>;
export type AdminRoutePatch = z.infer<typeof AdminRoutePatch>;
export const AdminRouteDto = AdminRouteInput.extend({
  id: PublicId,
  polyline: z.string(),
  distanceKm: z.number(),
}).strip();
export type AdminRouteDto = z.infer<typeof AdminRouteDto>;
export const AdminTimetableInput = z
  .object({
    routeId: PublicId,
    busTypeId: PublicId,
    departureLocal: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    daysMask: z.number().int().min(1).max(127),
    ...dateWindow,
    isActive: z.boolean().default(true),
  })
  .strict()
  .refine((x) => !x.validTo || x.validTo >= x.validFrom, { message: "Invalid validity window" });
export const AdminTimetablePatch = z.object(AdminTimetableInput.shape).strict().partial();
export type AdminTimetableInput = z.infer<typeof AdminTimetableInput>;
export type AdminTimetablePatch = z.infer<typeof AdminTimetablePatch>;
export const AdminTimetableDto = AdminTimetableInput.safeExtend({ id: PublicId }).strip();
export type AdminTimetableDto = z.infer<typeof AdminTimetableDto>;

export const GenerateTripsInput = z
  .object({ from: ServiceDateString, to: ServiceDateString })
  .strict()
  .refine((x) => x.to >= x.from, { message: "Invalid date range" });
export type GenerateTripsInput = z.infer<typeof GenerateTripsInput>;
export const GenerateTripsDto = z.object({ count: z.number().int().nonnegative() });
export type GenerateTripsDto = z.infer<typeof GenerateTripsDto>;
export const GrantRoleInput = z
  .object({ role: Role, depotId: PublicId.optional(), districtId: PublicId.optional() })
  .strict()
  .superRefine((x, ctx) => {
    const depotRole = ["DRIVER", "CONDUCTOR", "DEPOT_STAFF", "DEPOT_MANAGER"].includes(x.role);
    if (
      depotRole
        ? !x.depotId || !!x.districtId
        : x.role === "DISTRICT_OFFICER"
          ? !x.districtId || !!x.depotId
          : !!x.depotId || !!x.districtId
    )
      ctx.addIssue({ code: "custom", message: "Role scope does not match role" });
  });
export type GrantRoleInput = z.infer<typeof GrantRoleInput>;
export const AdminRoleDto = z.object({
  id: PublicId,
  userId: PublicId,
  role: Role,
  depotId: PublicId.nullable(),
  districtId: PublicId.nullable(),
});
export type AdminRoleDto = z.infer<typeof AdminRoleDto>;

export const AdminUserDto = z.object({
  id: PublicId,
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  roles: z.array(AdminRoleDto),
});
export type AdminUserDto = z.infer<typeof AdminUserDto>;
const paise = z.number().int().nonnegative();
export const AdminFareInput = z
  .object({
    busTypeId: PublicId,
    baseFarePaise: paise,
    perKmPaise: paise,
    minFarePaise: paise,
    reservationFeePaise: paise,
    ...dateWindow,
  })
  .strict()
  .refine((x) => !x.validTo || x.validTo > x.validFrom, { message: "Invalid validity window" });
export type AdminFareInput = z.infer<typeof AdminFareInput>;
export const AdminFareDto = AdminFareInput.safeExtend({ id: PublicId }).strip();
export type AdminFareDto = z.infer<typeof AdminFareDto>;
export const AdminRefundInput = z
  .object({
    name,
    tiers: z
      .array(
        z
          .object({ minHoursBefore: z.number().nonnegative(), percent: z.number().int().min(0).max(100) })
          .strict(),
      )
      .min(1)
      .max(20),
    cancellationFeePaise: paise,
    validFrom: iso,
  })
  .strict()
  .superRefine((x, ctx) => {
    x.tiers.forEach((tier, i) => {
      if (i && tier.minHoursBefore >= x.tiers[i - 1]!.minHoursBefore)
        ctx.addIssue({
          code: "custom",
          path: ["tiers", i],
          message: "Tiers must decrease strictly by hours",
        });
    });
  });
export type AdminRefundInput = z.infer<typeof AdminRefundInput>;
export const AdminRefundDto = AdminRefundInput.safeExtend({ id: PublicId, isActive: z.boolean() }).strip();
export type AdminRefundDto = z.infer<typeof AdminRefundDto>;

const positive = z.number().int().positive();
export const AdminSettingsInput = z
  .object({
    "booking.holdMinutes": positive.optional(),
    "booking.maxPassengers": positive.optional(),
    "booking.daysAhead": positive.optional(),
    "booking.closeMinutesBefore": z.number().int().nonnegative().optional(),
    "activation.opensMinutesBefore": z.number().int().nonnegative().optional(),
    "activation.closesMinutesAfter": z.number().int().nonnegative().optional(),
    "ticket.graceMinutesAfterArrival": z.number().int().nonnegative().optional(),
    "gift.cutoffMinutesBefore": z.number().int().nonnegative().optional(),
    "gift.maxTransfers": z.number().int().nonnegative().optional(),
    "pass.activateWithinDays": positive.optional(),
    "qr.periodSec": z.literal(30).optional(),
    "qr.windowSteps": z.literal(1).optional(),
  })
  .strict()
  .refine((x) => Object.keys(x).length > 0, { message: "At least one setting is required" });
export type AdminSettingsInput = z.infer<typeof AdminSettingsInput>;
export const AdminSettingDto = z.object({ key: z.string(), value: z.unknown() });
export type AdminSettingDto = z.infer<typeof AdminSettingDto>;
export const AdminAuditDto = z.object({
  id: PublicId,
  actorUserId: z.string().nullable(),
  actorRole: Role.nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
  createdAt: iso,
  ip: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
});
export type AdminAuditDto = z.infer<typeof AdminAuditDto>;
export const AdminAuditPage = z.object({
  items: z.array(AdminAuditDto),
  nextCursor: PublicId.nullable(),
});
export const OpsDepotDto = z.object({
  id: PublicId,
  code: z.string(),
  nameEn: z.string(),
  nameTe: z.string(),
  districtId: PublicId,
});
export const OpsBusTypeDto = z.object({ id: PublicId, nameEn: z.string(), nameTe: z.string() });
