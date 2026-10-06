import { performance } from "node:perf_hooks";
import {
  type BusStandDto,
  type BusStandRouteDto,
  type DistrictDto,
  formatIstDate,
  formatIstTime,
  localTimeToUtc,
  type PlaceDto,
  type PlacesSearchQuery,
  type RouteDto,
  type SearchTripsQuery,
  type TimetableDto,
  type TripSummaryDto,
} from "@aptransit/shared";
import { Injectable, Logger } from "@nestjs/common";
import { AppError } from "../../common/errors/app-error";
import { TtlCache } from "../../common/services/ttl-cache";
import { RedisService } from "../../redis/redis.service";
import { holdCountKey } from "../bookings/seat-holds";
import { NetworkRepository, type StopSearchRow } from "./network.repository";
import { boardingDepartureMs, hasFare, medianGapMinutes, toTripSummary } from "./trip-summary";

const CACHE_TTL_MS = 60_000;
/** Candidates fetched before ranking. The stops table is small (docs/19 has 24 stops). */
const PLACES_CANDIDATES = 50;
/** docs/07 section 1 default, used when the settings row is missing. */
const DEFAULT_CLOSE_MINUTES_BEFORE = 10;

@Injectable()
export class NetworkService {
  private readonly logger = new Logger(NetworkService.name);
  private readonly placesCache = new TtlCache<PlaceDto[]>(CACHE_TTL_MS);
  private readonly districtsCache = new TtlCache<DistrictDto[]>(CACHE_TTL_MS, 1);
  private readonly settingsCache = new TtlCache<number>(CACHE_TTL_MS, 50);

  invalidateAdminChanges(): void { this.placesCache.clear(); this.districtsCache.clear(); this.settingsCache.clear(); }

  constructor(
    private readonly repo: NetworkRepository,
    private readonly redis?: RedisService,
  ) {}

  /** Prefix and contains match on English and Telugu names. Bus stands first, then prefix matches, then by name. */
  async searchPlaces({ q, limit }: PlacesSearchQuery): Promise<PlaceDto[]> {
    const needle = q.normalize("NFC").trim();
    const key = `${needle.toLowerCase()}|${limit}`;
    return this.placesCache.getOrLoad(key, async () => {
      const rows = await this.repo.searchStops(needle, PLACES_CANDIDATES);
      return rankPlaces(rows, needle)
        .slice(0, limit)
        .map((s) => ({
          id: s.id,
          kind: s.isBusStand ? "BUS_STAND" : "STOP",
          nameEn: s.nameEn,
          nameTe: s.nameTe,
          districtNameEn: s.districtNameEn,
          districtNameTe: s.districtNameTe,
        }));
    });
  }

  districts(): Promise<DistrictDto[]> {
    return this.districtsCache.getOrLoad("all", () => this.repo.districts());
  }

  async busStandsOfDistrict(districtId: string): Promise<BusStandDto[]> {
    const result = await this.repo.busStandsOfDistrict(districtId);
    if (!result) throw new AppError("NOT_FOUND", "District not found");
    return result;
  }

  async routesOfBusStand(busStandId: string): Promise<BusStandRouteDto[]> {
    const result = await this.repo.routesOfBusStand(busStandId);
    if (!result) throw new AppError("NOT_FOUND", "Bus stand not found");
    return result;
  }

  async route(routeId: string): Promise<RouteDto> {
    const route = await this.repo.route(routeId);
    if (!route) throw new AppError("NOT_FOUND", "Route not found");
    return route;
  }

  /** Trips of one route on a date, origin to destination, cancelled ones included with their status. */
  async timetable(routeId: string, date: string | undefined, now = new Date()): Promise<TimetableDto> {
    const route = await this.route(routeId);
    const serviceDate = date ?? formatIstDate(now);
    const rows = (
      await this.repo.tripRows({
        fromStopId: route.origin.id,
        toStopId: route.destination.id,
        serviceDate,
        routeId: route.id,
        includeCancelled: true,
      })
    ).filter(hasFare);

    const taken = await this.repo.seatsTaken(rows.map((r) => r.tripId));
    const trips = rows.map((r) => toTripSummary(r, taken.get(r.tripId) ?? 0));

    const running = rows
      .filter((r) => r.status !== "CANCELLED")
      .map(boardingDepartureMs)
      .sort((a, b) => a - b);
    const first = running[0];
    const last = running[running.length - 1];
    const next = running.find((ms) => ms > now.getTime());

    return {
      date: serviceDate,
      firstDepartureLocal: first === undefined ? null : formatIstTime(new Date(first)),
      lastDepartureLocal: last === undefined ? null : formatIstTime(new Date(last)),
      nextDepartureAt: next === undefined ? null : new Date(next).toISOString(),
      frequencyMin: medianGapMinutes(running),
      trips,
    };
  }

  /**
   * GET /search/trips (Day 4). Two queries: trips with fares, then seat counts. Trips whose booking
   * has closed (booking.closeMinutesBefore before departure from the boarding stop) are left out.
   */
  async searchTrips(query: SearchTripsQuery, now = new Date()): Promise<TripSummaryDto[]> {
    const started = performance.now();
    const closeMinutes = await this.settingNumber("booking.closeMinutesBefore", DEFAULT_CLOSE_MINUTES_BEFORE);
    const rows = await this.repo.tripRows({ fromStopId: query.from, toStopId: query.to, serviceDate: query.date });

    const bookableFrom = now.getTime() + closeMinutes * 60_000;
    const afterMs = query.after ? localTimeToUtc(query.date, query.after).getTime() : Number.NEGATIVE_INFINITY;
    const kept = rows.filter((r) => {
      const departure = boardingDepartureMs(r);
      return departure > bookableFrom && departure >= afterMs;
    });

    const missingFare = kept.filter((r) => !hasFare(r)).length;
    if (missingFare > 0) this.logger.warn(`search: ${missingFare} trips skipped, no fare rule on ${query.date}`);
    const priced = kept.filter(hasFare);

    const tripIds = priced.map((r) => r.tripId);
    const taken = await this.repo.seatsTaken(tripIds);
    const holdCounts = await this.getHoldCounts(tripIds);
    const result = priced
      .map((r) => {
        const totalTaken = (taken.get(r.tripId) ?? 0) + (holdCounts.get(r.tripId) ?? 0);
        return toTripSummary(r, totalTaken);
      })
      .sort((a, b) => a.departureAt.localeCompare(b.departureAt) || a.tripId.localeCompare(b.tripId));

    const ms = Math.round(performance.now() - started);
    this.logger.log(`search: ${result.length} trips in ${ms} ms`);
    return result;
  }

  private async getHoldCounts(tripIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (!this.redis || tripIds.length === 0) return map;
    try {
      const values = await this.redis.client.mget(tripIds.map((id) => holdCountKey(id)));
      tripIds.forEach((tripId, i) => {
        const count = Number.parseInt(values[i] ?? "0", 10);
        if (Number.isFinite(count) && count > 0) map.set(tripId, count);
      });
    } catch {
      // Redis fail open: return empty map
    }
    return map;
  }

  private async settingNumber(key: string, fallback: number): Promise<number> {
    return this.settingsCache.getOrLoad(key, async () => (await this.repo.settingNumber(key)) ?? fallback);
  }
}

/** Sort order for places: bus stands, then names that start with the text, then English name. */
export function rankPlaces(rows: readonly StopSearchRow[], needle: string): StopSearchRow[] {
  const lower = needle.toLowerCase();
  const startsWith = (s: StopSearchRow) =>
    s.nameEn.toLowerCase().startsWith(lower) || s.nameTe.startsWith(needle) ? 0 : 1;
  return [...rows].sort(
    (a, b) =>
      Number(!a.isBusStand) - Number(!b.isBusStand) ||
      startsWith(a) - startsWith(b) ||
      a.nameEn.localeCompare(b.nameEn),
  );
}
