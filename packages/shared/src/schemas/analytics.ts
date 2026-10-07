import { z } from "zod";
import { PublicId } from "./search";

export const RouteAnalyticsDto = z.object({
  routeId: z.string(),
  routeCode: z.string(),
  routeNameEn: z.string(),
  routeNameTe: z.string(),
  passengers: z.number().int().nonnegative(),
  trips: z.number().int().nonnegative(),
  loadFactorPct: z.number().min(0).max(100),
  avgDelayMin: z.number().nonnegative(),
  cancellations: z.number().int().nonnegative(),
  revenuePaise: z.number().int().nonnegative(),
});
export type RouteAnalyticsDto = z.infer<typeof RouteAnalyticsDto>;

export const BusAnalyticsDto = z.object({
  busId: z.string(),
  registrationNumber: z.string(),
  busType: z.string(),
  depotId: z.string(),
  trips: z.number().int().nonnegative(),
  km: z.number().nonnegative(),
  utilisationPct: z.number().min(0).max(100),
  downtimeHours: z.number().nonnegative(),
});
export type BusAnalyticsDto = z.infer<typeof BusAnalyticsDto>;

export const PassengerAnalyticsDto = z.object({
  ticketsSold: z.number().int().nonnegative(),
  passUsage: z.number().int().nonnegative(),
  busyHours: z.array(z.number().int().nonnegative()),
  topRoutes: z.array(
    z.object({
      routeId: z.string(),
      routeCode: z.string(),
      passengers: z.number().int().nonnegative(),
    }),
  ),
});
export type PassengerAnalyticsDto = z.infer<typeof PassengerAnalyticsDto>;

export const DelayAnalyticsDto = z.object({
  avgDelayByHour: z.array(
    z.object({
      hour: z.number().int().min(0).max(23),
      avgDelayMin: z.number().nonnegative(),
    }),
  ),
  worstRoutes: z.array(
    z.object({
      routeId: z.string(),
      routeCode: z.string(),
      avgDelayMin: z.number().nonnegative(),
    }),
  ),
});
export type DelayAnalyticsDto = z.infer<typeof DelayAnalyticsDto>;

export const DemandBand = z.enum(["MORNING", "AFTERNOON", "EVENING", "NIGHT"]);
export type DemandBand = z.infer<typeof DemandBand>;

export const DemandLevel = z.enum(["LOW", "MEDIUM", "HIGH"]);
export type DemandLevel = z.infer<typeof DemandLevel>;

/**
 * Band of an IST departure hour, same bands as search: morning 05:00 to 11:59, afternoon 12:00
 * to 16:59, evening 17:00 to 20:59, night 21:00 to 04:59.
 */
export function demandBandOfHour(istHour: number): DemandBand {
  if (istHour >= 5 && istHour < 12) return "MORNING";
  if (istHour >= 12 && istHour < 17) return "AFTERNOON";
  if (istHour >= 17 && istHour < 21) return "EVENING";
  return "NIGHT";
}

/** Fixed demand thresholds on load factor (Day 15): under 50 LOW, 50 to 80 MEDIUM, over 80 HIGH. */
export function demandLevelOf(loadFactorPct: number): DemandLevel {
  if (loadFactorPct < 50) return "LOW";
  if (loadFactorPct <= 80) return "MEDIUM";
  return "HIGH";
}

export const DemandBandDto = z.object({
  band: DemandBand,
  loadFactorPct: z.number().min(0).max(100),
  level: DemandLevel,
});
export type DemandBandDto = z.infer<typeof DemandBandDto>;

export const AnalyticsRoutesQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  districtId: PublicId.optional(),
});
export type AnalyticsRoutesQuery = z.infer<typeof AnalyticsRoutesQuery>;

export const AnalyticsBusesQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  depotId: PublicId.optional(),
});
export type AnalyticsBusesQuery = z.infer<typeof AnalyticsBusesQuery>;

export const AnalyticsPassengersQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type AnalyticsPassengersQuery = z.infer<typeof AnalyticsPassengersQuery>;

export const AnalyticsDelaysQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  routeId: PublicId.optional(),
});
export type AnalyticsDelaysQuery = z.infer<typeof AnalyticsDelaysQuery>;

export const AnalyticsDemandQuery = z.object({
  routeId: PublicId,
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type AnalyticsDemandQuery = z.infer<typeof AnalyticsDemandQuery>;
