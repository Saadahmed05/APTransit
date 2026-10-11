import type { BusStandDto, BusStandRouteDto, DistrictDto, RouteDto, ServiceType, StateDto, TripStatus } from "@aptransit/shared";
import { AP_STATE, AP_STATE_ID, BUS_TYPES, DISTRICTS, ROUTE_DEFS, STOPS, TIMETABLE_DEFS } from "../prisma/seed-data";
import type { StopSearchRow, TripRow, TripRowsArgs } from "../src/modules/network/network.repository";
import { generateTripsForTimetables } from "../src/modules/trips/trip-generator";

// In memory copy of the docs/19 network with the same query semantics as NetworkRepository,
// so HTTP tests run without a database. The Neon test (network.int.test.ts) covers the real SQL.

export const stopId = (code: string) => `stop${code.toLowerCase()}0000`;
export const routeId = (code: string) => `route${code.replace(/-/g, "").toLowerCase()}`;
export const districtId = (code: string) => `dist${code.toLowerCase()}0000`;
export const busStandId = (code: string) => `stand${code.toLowerCase()}000`;

interface FixtureRoute {
  id: string;
  code: string;
  nameEn: string;
  nameTe: string;
  isActive: boolean;
  stops: { stopCode: string; kmFromOrigin: number; minutesFromOrigin: number }[];
}

interface FixtureTrip {
  id: string;
  routeId: string;
  serviceType: ServiceType;
  serviceDate: string;
  departureMs: number;
  status: TripStatus;
  delayMinutes: number;
  hasOpenIncident: boolean;
}

export interface NetworkFixtureOptions {
  /** IST dates (YYYY-MM-DD) to generate trips for. */
  dates: string[];
  /** Route codes to keep. Default: all 12 routes. */
  routeCodes?: string[];
}

export class FakeNetworkRepository {
  readonly routes: FixtureRoute[];
  readonly trips: FixtureTrip[];
  /** Taken seats per trip id, tests change it directly. */
  readonly taken = new Map<string, number>();
  readonly settings = new Map<string, number>([["booking.closeMinutesBefore", 10]]);
  calls = { searchStops: 0, districts: 0, tripRows: 0, seatsTaken: 0 };

  constructor({ dates, routeCodes }: NetworkFixtureOptions) {
    const allRoutes: FixtureRoute[] = ROUTE_DEFS.flatMap((def) => [
      {
        id: routeId(def.code),
        code: def.code,
        nameEn: def.nameEn,
        nameTe: def.nameTe,
        isActive: true,
        stops: def.stops,
      },
      {
        id: routeId(def.reverseCode),
        code: def.reverseCode,
        nameEn: def.reverseNameEn,
        nameTe: def.reverseNameTe,
        isActive: true,
        stops: [...def.stops].reverse().map((s) => ({
          stopCode: s.stopCode,
          kmFromOrigin: def.stops[def.stops.length - 1]!.kmFromOrigin - s.kmFromOrigin,
          minutesFromOrigin:
            def.stops[def.stops.length - 1]!.minutesFromOrigin - s.minutesFromOrigin,
        })),
      },
    ]);
    this.routes = routeCodes ? allRoutes.filter((r) => routeCodes.includes(r.code)) : allRoutes;

    const timetables = TIMETABLE_DEFS.filter((t) =>
      this.routes.some((r) => r.code === t.routeCode),
    ).map((t, i) => {
      const route = this.routes.find((r) => r.code === t.routeCode)!;
      return {
        id: `tt${i}`,
        routeId: route.id,
        routeCode: route.code,
        busTypeId: t.serviceType,
        departureLocal: t.departureLocal,
        daysMask: 127,
        validFrom: new Date("2026-01-01T00:00:00.000Z"),
        validTo: null,
        isActive: true,
        durationMinutes: route.stops[route.stops.length - 1]!.minutesFromOrigin,
      };
    });
    const sorted = [...dates].sort();
    this.trips = generateTripsForTimetables(timetables, sorted[0]!, sorted[sorted.length - 1]!)
      .filter((t) => dates.includes(t.serviceDateStr))
      .map((t, i) => ({
        id: `trip${String(i).padStart(7, "0")}`,
        routeId: t.routeId,
        serviceType: t.busTypeId as ServiceType,
        serviceDate: t.serviceDateStr,
        departureMs: t.scheduledDepartureAt.getTime(),
        status: "SCHEDULED" as TripStatus,
        delayMinutes: 0,
        hasOpenIncident: false,
      }));
  }

  private stop(code: string) {
    return STOPS.find((s) => s.code === code)!;
  }

  private district(code: string) {
    return DISTRICTS.find((d) => d.code === code)!;
  }

  async searchStops(q: string, take: number): Promise<StopSearchRow[]> {
    this.calls.searchStops++;
    const lower = q.toLowerCase();
    return STOPS.filter((s) => s.nameEn.toLowerCase().includes(lower) || s.nameTe.includes(q))
      .sort((a, b) => a.nameEn.localeCompare(b.nameEn))
      .slice(0, take)
      .map((s) => ({
        id: stopId(s.code),
        nameEn: s.nameEn,
        nameTe: s.nameTe,
        isBusStand: s.isBusStand,
        districtNameEn: this.district(s.districtCode).nameEn,
        districtNameTe: this.district(s.districtCode).nameTe,
      }));
  }

  async allStops(): Promise<Required<StopSearchRow>[]> {
    return STOPS.map((s) => ({
      id: stopId(s.code),
      nameEn: s.nameEn,
      nameTe: s.nameTe,
      isBusStand: s.isBusStand,
      districtNameEn: this.district(s.districtCode).nameEn,
      districtNameTe: this.district(s.districtCode).nameTe,
      lat: s.lat,
      lng: s.lng,
    }));
  }

  async states(): Promise<StateDto[]> {
    const [minLng, minLat, maxLng, maxLat] = AP_STATE.bounds;
    return [
      {
        id: AP_STATE_ID,
        code: AP_STATE.code,
        nameEn: AP_STATE.nameEn,
        nameTe: AP_STATE.nameTe,
        center: AP_STATE.center,
        bounds: [minLng, minLat, maxLng, maxLat],
        zoom: AP_STATE.zoom,
      },
    ];
  }

  async districts(): Promise<DistrictDto[]> {
    this.calls.districts++;
    return DISTRICTS.map((d) => ({
      id: districtId(d.code),
      code: d.code,
      nameEn: d.nameEn,
      nameTe: d.nameTe,
      stateId: AP_STATE_ID,
      busStandCount: STOPS.filter((s) => s.isBusStand && s.districtCode === d.code).length,
    })).sort((a, b) => a.nameEn.localeCompare(b.nameEn));
  }

  private routesLeaving(stopCode: string): BusStandRouteDto[] {
    return this.routes
      .filter((r) => r.isActive && r.stops.slice(0, -1).some((s) => s.stopCode === stopCode))
      .map((r) => {
        const dest = this.stop(r.stops[r.stops.length - 1]!.stopCode);
        return {
          id: r.id,
          code: r.code,
          nameEn: r.nameEn,
          nameTe: r.nameTe,
          destination: { id: stopId(dest.code), nameEn: dest.nameEn, nameTe: dest.nameTe },
          serviceTypes: [
            ...new Set(
              TIMETABLE_DEFS.filter((t) => t.routeCode === r.code).map((t) => t.serviceType),
            ),
          ].sort(),
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code));
  }

  async busStandsOfDistrict(id: string): Promise<BusStandDto[] | null> {
    const d = DISTRICTS.find((x) => districtId(x.code) === id);
    if (!d) return null;
    return STOPS.filter((s) => s.isBusStand && s.districtCode === d.code)
      .map((s) => ({
        id: busStandId(s.code),
        nameEn: s.nameEn,
        nameTe: s.nameTe,
        routeCount: this.routesLeaving(s.code).length,
      }))
      .sort((a, b) => a.nameEn.localeCompare(b.nameEn));
  }

  async routesOfBusStand(id: string): Promise<BusStandRouteDto[] | null> {
    const s = STOPS.find((x) => x.isBusStand && busStandId(x.code) === id);
    return s ? this.routesLeaving(s.code) : null;
  }

  async route(id: string): Promise<RouteDto | null> {
    const r = this.routes.find((x) => x.id === id);
    if (!r || !r.isActive) return null;
    const ref = (code: string) => {
      const s = this.stop(code);
      return { id: stopId(code), nameEn: s.nameEn, nameTe: s.nameTe };
    };
    return {
      id: r.id,
      code: r.code,
      nameEn: r.nameEn,
      nameTe: r.nameTe,
      distanceKm: r.stops[r.stops.length - 1]!.kmFromOrigin,
      polyline: "",
      origin: ref(r.stops[0]!.stopCode),
      destination: ref(r.stops[r.stops.length - 1]!.stopCode),
      stops: r.stops.map((rs, i) => {
        const s = this.stop(rs.stopCode);
        return {
          stopId: stopId(s.code),
          seq: i + 1,
          nameEn: s.nameEn,
          nameTe: s.nameTe,
          kind: s.isBusStand ? ("BUS_STAND" as const) : ("STOP" as const),
          lat: s.lat,
          lng: s.lng,
          kmFromOrigin: rs.kmFromOrigin,
          minutesFromOrigin: rs.minutesFromOrigin,
          isBoarding: true,
          isDropping: true,
        };
      }),
    };
  }

  async tripRows({
    fromStopId,
    toStopId,
    serviceDate,
    routeId: onlyRoute,
    includeCancelled = false,
  }: TripRowsArgs): Promise<TripRow[]> {
    this.calls.tripRows++;
    const rows: TripRow[] = [];
    for (const trip of this.trips) {
      if (trip.serviceDate !== serviceDate) continue;
      if (!includeCancelled && trip.status === "CANCELLED") continue;
      if (onlyRoute && trip.routeId !== onlyRoute) continue;
      const route = this.routes.find((r) => r.id === trip.routeId);
      if (!route?.isActive) continue;
      const fromIdx = route.stops.findIndex((s) => stopId(s.stopCode) === fromStopId);
      const toIdx = route.stops.findIndex((s) => stopId(s.stopCode) === toStopId);
      if (fromIdx < 0 || toIdx < 0 || toIdx <= fromIdx) continue;
      const bt = BUS_TYPES.find((b) => b.serviceType === trip.serviceType)!;
      rows.push({
        tripId: trip.id,
        routeCode: route.code,
        serviceType: trip.serviceType,
        totalSeats: bt.totalSeats,
        freeTravelEligible: bt.freeTravelEligible,
        status: trip.status,
        delayMinutes: trip.delayMinutes,
        hasOpenIncident: trip.hasOpenIncident,
        departureMs: trip.departureMs,
        fromMinutes: route.stops[fromIdx]!.minutesFromOrigin,
        toMinutes: route.stops[toIdx]!.minutesFromOrigin,
        fromKm: route.stops[fromIdx]!.kmFromOrigin,
        toKm: route.stops[toIdx]!.kmFromOrigin,
        fare: {
          baseFarePaise: bt.baseFarePaise,
          perKmPaise: bt.perKmPaise,
          minFarePaise: bt.minFarePaise,
          reservationFeePaise: bt.reservationFeePaise,
        },
        villageEnd: [fromStopId, toStopId].some(
          (id) => !STOPS.find((st) => stopId(st.code) === id)?.isBusStand,
        ),
      });
    }
    return rows.sort(
      (a, b) => a.departureMs + a.fromMinutes * 60_000 - (b.departureMs + b.fromMinutes * 60_000),
    );
  }

  async seatsTaken(tripIds: string[]): Promise<Map<string, number>> {
    this.calls.seatsTaken++;
    return new Map(
      tripIds.filter((id) => this.taken.has(id)).map((id) => [id, this.taken.get(id)!]),
    );
  }

  async settingNumber(key: string): Promise<number | null> {
    return this.settings.get(key) ?? null;
  }
}
