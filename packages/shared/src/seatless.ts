import type { ServiceType } from "./enums";

/**
 * D-046: local buses are not booked by seat. Pallevelugu, Ultra Pallevelugu and City Ordinary are
 * always seatless (City Ordinary and Metro Express cannot be booked in the app at all, D-045), and so is any trip of 50 km or less (owner's rule). The ticket still counts
 * against the bus capacity (40 to 50 seats), but the passenger never picks or sees a seat.
 */
export const SEATLESS_MAX_KM = 50;

export const SEATLESS_SERVICE_TYPES: readonly ServiceType[] = [
  "PALLEVELUGU",
  "ULTRA_PALLEVELUGU",
  "CITY_ORDINARY",
];

export function isSeatless(serviceType: ServiceType, distanceKm: number): boolean {
  return SEATLESS_SERVICE_TYPES.includes(serviceType) || distanceKm <= SEATLESS_MAX_KM;
}

/**
 * D-046: Pallevelugu and city buses run locally only. No route that carries them is longer than
 * this. The owner said "nearby towns" (Nandyal, Adoni) without a number; Kurnool to Adoni is about
 * 120 km on the seeded route, so 130 km is an assumption (A), docs/18.
 */
export const LOCAL_ROUTE_MAX_KM = 130;

/** Km between two stops of a route, or infinity when either stop is unknown (then only the service decides). */
export function segmentKm(
  stops: readonly { stopId: string; kmFromOrigin: number }[] | undefined,
  fromStopId: string,
  toStopId: string,
): number {
  const from = stops?.find((s) => s.stopId === fromStopId)?.kmFromOrigin;
  const to = stops?.find((s) => s.stopId === toStopId)?.kmFromOrigin;
  return from !== undefined && to !== undefined ? to - from : Number.POSITIVE_INFINITY;
}
