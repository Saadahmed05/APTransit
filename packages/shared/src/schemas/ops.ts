import { z } from "zod";
import { BusStatus, IncidentStatus, ServiceType } from "../enums";
import { PublicId, ServiceDateString } from "./search";
import { TripDto, IncidentDto } from "./tracking";
const iso = z.string().datetime();
export const OpsQuery = z
  .object({
    depotId: PublicId.optional(),
    status: z.string().max(30).optional(),
    q: z.string().trim().max(80).optional(),
    at: iso.optional(),
    date: ServiceDateString.optional(),
    routeId: PublicId.optional(),
    type: z.enum(["DRIVER", "CONDUCTOR"]).optional(),
  })
  .strict();
export type OpsQuery = z.infer<typeof OpsQuery>;
export const OpsBusInput = z
  .object({
    regNo: z.string().trim().min(5).max(24),
    busTypeId: PublicId,
    depotId: PublicId,
    status: BusStatus.default("IDLE"),
    maintenanceDueAt: iso.nullable().optional(),
    odometerKm: z.number().int().nonnegative().default(0),
  })
  .strict();
export type OpsBusInput = z.infer<typeof OpsBusInput>;
export const OpsBusPatch = OpsBusInput.partial();
export type OpsBusPatch = z.infer<typeof OpsBusPatch>;
export const MaintenanceInput = z
  .object({
    kind: z.string().trim().min(1).max(80),
    startAt: iso,
    endAt: iso.optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((b) => !b.endAt || b.endAt > b.startAt, { message: "Maintenance end must follow start" });
export type MaintenanceInput = z.infer<typeof MaintenanceInput>;
export const AssignTripInput = z
  .object({ busId: PublicId, driverId: PublicId, conductorId: PublicId.optional() })
  .strict();
export type AssignTripInput = z.infer<typeof AssignTripInput>;
export const ReplaceBusInput = z
  .object({
    busId: PublicId,
    driverId: PublicId.optional(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
export type ReplaceBusInput = z.infer<typeof ReplaceBusInput>;
export const OpsReasonInput = z.object({ reason: z.string().trim().min(1).max(500) }).strict();
export const ResolveIncidentInput = z.object({ note: z.string().trim().min(1).max(500) }).strict();
export const OpsStaffInput = z
  .object({
    type: z.enum(["DRIVER", "CONDUCTOR"]),
    depotId: PublicId,
    email: z.email().max(254),
    name: z.string().trim().min(1).max(100),
    employeeCode: z.string().trim().min(1).max(40),
    licenseNo: z.string().trim().min(1).max(50).optional(),
  })
  .strict()
  .refine((b) => b.type !== "DRIVER" || Boolean(b.licenseNo), {
    message: "Driver licence required",
  });
export type OpsStaffInput = z.infer<typeof OpsStaffInput>;
export const BusDto = z.object({
  id: PublicId,
  regNo: z.string(),
  busTypeId: PublicId,
  depotId: PublicId,
  status: BusStatus,
  serviceType: ServiceType,
  totalSeats: z.number().int(),
  maintenanceDueAt: iso.nullable(),
  odometerKm: z.number().int(),
  currentRouteNameEn: z.string().nullable().optional(),
  currentRouteNameTe: z.string().nullable().optional(),
  driverName: z.string().nullable().optional(),
});
export type BusDto = z.infer<typeof BusDto>;
export const MaintenanceDto = z.object({
  id: PublicId,
  busId: PublicId,
  kind: z.string(),
  note: z.string().nullable(),
  startAt: iso,
  endAt: iso.nullable(),
});
export type MaintenanceDto = z.infer<typeof MaintenanceDto>;

export const AssignmentDto = z.object({
  id: PublicId,
  busId: PublicId,
  busRegNo: z.string(),
  driverId: PublicId,
  driverName: z.string().nullable(),
  conductorId: PublicId.nullable(),
  conductorName: z.string().nullable(),
  reason: z.enum(["INITIAL", "REPLACEMENT"]),
  startedAt: iso,
  endedAt: iso.nullable(),
});
export type AssignmentDto = z.infer<typeof AssignmentDto>;
export const OpsTripDto = TripDto.extend({
  routeId: PublicId,
  routeNameEn: z.string(),
  routeNameTe: z.string(),
  depotId: PublicId,
  passengers: z.number().int().nonnegative(),
  assignment: AssignmentDto.nullable(),
});
export type OpsTripDto = z.infer<typeof OpsTripDto>;
export const OpsTripProfileDto = OpsTripDto.extend({
  assignments: z.array(AssignmentDto),
  incidents: z.array(IncidentDto),
});
export const BusProfileDto = BusDto.extend({
  trips: z.array(OpsTripDto),
  maintenance: z.array(MaintenanceDto),
});
export const StaffDto = z.object({
  id: PublicId,
  userId: PublicId,
  depotId: PublicId,
  type: z.enum(["DRIVER", "CONDUCTOR"]),
  email: z.string().nullable(),
  name: z.string().nullable(),
  employeeCode: z.string(),
  licenseNo: z.string().optional(),
});
export type StaffDto = z.infer<typeof StaffDto>;

export const DeviceDto = z.object({
  id: PublicId,
  userId: PublicId,
  label: z.string(),
  approvedAt: iso.nullable(),
  approvedById: PublicId.nullable(),
  revokedAt: iso.nullable(),
});
export type DeviceDto = z.infer<typeof DeviceDto>;
export const OpsDashboardDto = z.object({
  activeBuses: z.number().int(),
  totalBuses: z.number().int(),
  activeTrips: z.number().int(),
  delayedTrips: z.number().int(),
  breakdowns: z.number().int(),
  openIncidents: z.number().int(),
  busStatusCounts: z.record(BusStatus, z.number().int()),
});
export type OpsDashboardDto = z.infer<typeof OpsDashboardDto>;
export { IncidentStatus };
