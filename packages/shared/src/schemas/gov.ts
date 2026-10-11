import { z } from "zod";
import { LiveBusDto, IncidentDto } from "./tracking";
import { OpsTripDto } from "./ops";
import { PublicId } from "./search";

export const GovOverviewDto = z.object({
  activeBuses: z.number().int().nonnegative(),
  activeTrips: z.number().int().nonnegative(),
  passengersToday: z.number().int().nonnegative(),
  delayedTrips: z.number().int().nonnegative(),
  openIncidents: z.number().int().nonnegative(),
  onTimePct: z.number().min(0).max(100),
  ticketsToday: z.number().int().nonnegative(),
  revenueTodayPaise: z.number().int().nonnegative(),
  /** Complaints created on the date, complaints not yet resolved or closed, and mean hours from created to resolved over the last 30 days (null when none). */
  complaintsToday: z.number().int().nonnegative(),
  openComplaints: z.number().int().nonnegative(),
  avgHoursToResolve: z.number().nonnegative().nullable(),
});
export type GovOverviewDto = z.infer<typeof GovOverviewDto>;

export const GovDistrictMapItem = z.object({
  id: z.string(),
  code: z.string().optional(),
  nameEn: z.string().optional(),
  nameTe: z.string().optional(),
  activeBuses: z.number().int().nonnegative(),
  delayed: z.number().int().nonnegative(),
  incidents: z.number().int().nonnegative(),
  /** District headquarters bus stand, for the command center marker. */
  lat: z.number().nullable(),
  lng: z.number().nullable(),
});
export type GovDistrictMapItem = z.infer<typeof GovDistrictMapItem>;

export const GovMapDto = z.object({
  districts: z.array(GovDistrictMapItem),
  buses: z.array(LiveBusDto),
  incidents: z.array(IncidentDto),
});
export type GovMapDto = z.infer<typeof GovMapDto>;

export const GovDistrictSummaryDto = z.object({
  id: z.string(),
  code: z.string(),
  nameEn: z.string(),
  nameTe: z.string(),
  activeBuses: z.number().int().nonnegative(),
  activeTrips: z.number().int().nonnegative(),
  passengersToday: z.number().int().nonnegative(),
  delayedTrips: z.number().int().nonnegative(),
  openIncidents: z.number().int().nonnegative(),
  onTimePct: z.number().min(0).max(100),
  revenueTodayPaise: z.number().int().nonnegative(),
  depots: z.array(
    z.object({
      id: z.string(),
      code: z.string(),
      nameEn: z.string(),
      nameTe: z.string(),
      activeBuses: z.number().int().nonnegative(),
      activeTrips: z.number().int().nonnegative(),
      delayedTrips: z.number().int().nonnegative(),
      totalBuses: z.number().int().nonnegative(),
    }),
  ),
});
export type GovDistrictSummaryDto = z.infer<typeof GovDistrictSummaryDto>;

export const GovDepotSummaryDto = z.object({
  id: z.string(),
  code: z.string(),
  nameEn: z.string(),
  nameTe: z.string(),
  districtId: z.string(),
  activeBuses: z.number().int().nonnegative(),
  activeTrips: z.number().int().nonnegative(),
  delayedTrips: z.number().int().nonnegative(),
  totalBuses: z.number().int().nonnegative(),
  routes: z.array(
    z.object({
      id: z.string(),
      code: z.string(),
      nameEn: z.string(),
      nameTe: z.string(),
      tripsToday: z.number().int().nonnegative(),
      delayedTrips: z.number().int().nonnegative(),
      loadFactorPct: z.number().min(0).max(100),
    }),
  ),
});
export type GovDepotSummaryDto = z.infer<typeof GovDepotSummaryDto>;

export const GovRouteSummaryDto = z.object({
  id: z.string(),
  code: z.string(),
  depotId: z.string(),
  nameEn: z.string(),
  nameTe: z.string(),
  tripsToday: z.number().int().nonnegative(),
  delayedTrips: z.number().int().nonnegative(),
  loadFactorPct: z.number().min(0).max(100),
  busesOnRoute: z.number().int().nonnegative(),
  trips: z.array(OpsTripDto),
});
export type GovRouteSummaryDto = z.infer<typeof GovRouteSummaryDto>;

export const GovDateQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type GovDateQuery = z.infer<typeof GovDateQuery>;

/** GET /gov/overview and /gov/map: one state, or everything in the caller's scope when absent (D-034). */
export const GovStateQuery = GovDateQuery.extend({
  stateId: PublicId.optional(),
});
export type GovStateQuery = z.infer<typeof GovStateQuery>;
