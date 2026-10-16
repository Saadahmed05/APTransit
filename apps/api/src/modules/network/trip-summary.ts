import { calculateFare, deriveTripDisplayStatus, type FareRuleInput, isSeatless, type TripSummaryDto } from "@aptransit/shared";
import type { TripRow } from "./network.repository";

const MS_PER_MIN = 60_000;

/** Departure from the passenger's boarding stop, epoch ms. */
export function boardingDepartureMs(row: TripRow): number {
  return row.departureMs + row.fromMinutes * MS_PER_MIN;
}

/** Builds the public trip summary for one boarding and dropping pair. Fare only through fare.ts. */
export function toTripSummary(row: TripRow & { fare: FareRuleInput }, seatsTaken: number): TripSummaryDto {
  const departureMs = boardingDepartureMs(row);
  const arrivalMs = row.departureMs + row.toMinutes * MS_PER_MIN;
  const fare = calculateFare({ distanceKm: row.toKm - row.fromKm, rule: row.fare });
  return {
    tripId: row.tripId,
    routeCode: row.routeCode,
    serviceType: row.serviceType,
    departureAt: new Date(departureMs).toISOString(),
    arrivalAt: new Date(arrivalMs).toISOString(),
    durationMin: row.toMinutes - row.fromMinutes,
    farePaise: fare.totalPaise,
    seatsLeft: Math.max(0, row.totalSeats - seatsTaken),
    displayStatus: deriveTripDisplayStatus(row),
    delayMinutes: Math.max(0, row.delayMinutes),
    freeTravelEligible: row.freeTravelEligible,
    seatless: isSeatless(row.serviceType, row.toKm - row.fromKm),
  };
}

export function hasFare(row: TripRow): row is TripRow & { fare: FareRuleInput } {
  return row.fare !== null;
}

/** Median of the gaps between sorted times, in whole minutes. Null with fewer than two times. */
export function medianGapMinutes(sortedMs: readonly number[]): number | null {
  // D-048: several classes can leave at the same minute; the frequency is between departure times
  const times = [...new Set(sortedMs)];
  if (times.length < 2) return null;
  const gaps = times
    .slice(1)
    .map((t, i) => (t - times[i]!) / MS_PER_MIN)
    .sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  const median = gaps.length % 2 === 1 ? gaps[mid]! : (gaps[mid - 1]! + gaps[mid]!) / 2;
  return median > 0 ? Math.round(median) : null;
}
