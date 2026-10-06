import type {
  BusStandDto,
  BusStandRouteDto,
  DistrictDto,
  FareRuleInput,
  RouteDto,
  ServiceType,
  TripStatus,
} from "@aptransit/shared";
import { Injectable } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

/** A stop matched by the places search, before ranking. */
export interface StopSearchRow {
  id: string;
  nameEn: string;
  nameTe: string;
  isBusStand: boolean;
  districtNameEn: string;
  districtNameTe: string;
}

/** One trip that serves a stop pair, with everything search needs to build a TripSummaryDto. */
export interface TripRow {
  tripId: string;
  routeCode: string;
  serviceType: ServiceType;
  totalSeats: number;
  freeTravelEligible: boolean;
  status: TripStatus;
  delayMinutes: number;
  hasOpenIncident: boolean;
  /** Scheduled departure from the route origin, epoch ms. */
  departureMs: number;
  fromMinutes: number;
  toMinutes: number;
  fromKm: number;
  toKm: number;
  /** Fare rule valid on the service date, null when none exists (the trip is not sold). */
  fare: FareRuleInput | null;
}

export interface TripRowsArgs {
  fromStopId: string;
  toStopId: string;
  /** IST service date, YYYY-MM-DD. */
  serviceDate: string;
  routeId?: string;
  includeCancelled?: boolean;
}

/** Ticket statuses that hold a seat (docs/05 seat rule). Holds are added on Day 5. */
export const SEAT_TAKING_STATUSES = ["BOOKED", "ACTIVE", "SCANNED", "USED"] as const;

interface RawTripRow {
  tripId: string;
  routeCode: string;
  serviceType: ServiceType;
  totalSeats: number;
  freeTravelEligible: boolean;
  status: TripStatus;
  delayMinutes: number;
  hasOpenIncident: boolean;
  departureMs: number;
  fromMinutes: number;
  toMinutes: number;
  fromKm: number;
  toKm: number;
  baseFarePaise: number | null;
  perKmPaise: number | null;
  minFarePaise: number | null;
  reservationFeePaise: number | null;
}

/**
 * Every database read of the public network endpoints. The service holds the rules
 * (ranking, fares, filters); this class only fetches rows, so HTTP tests can swap it for a fake.
 */
@Injectable()
export class NetworkRepository {
  constructor(private readonly prisma: PrismaService) {}

  async searchStops(q: string, take: number): Promise<StopSearchRow[]> {
    const rows = await this.prisma.stop.findMany({
      where: {
        OR: [{ nameEn: { contains: q, mode: "insensitive" } }, { nameTe: { contains: q } }],
      },
      select: {
        id: true,
        nameEn: true,
        nameTe: true,
        busStandId: true,
        district: { select: { nameEn: true, nameTe: true } },
      },
      orderBy: { nameEn: "asc" },
      take,
    });
    return rows.map((s) => ({
      id: s.id,
      nameEn: s.nameEn,
      nameTe: s.nameTe,
      isBusStand: s.busStandId !== null,
      districtNameEn: s.district.nameEn,
      districtNameTe: s.district.nameTe,
    }));
  }

  async districts(): Promise<DistrictDto[]> {
    const rows = await this.prisma.district.findMany({
      select: { id: true, code: true, nameEn: true, nameTe: true, _count: { select: { busStands: true } } },
      orderBy: { nameEn: "asc" },
    });
    return rows.map((d) => ({
      id: d.id,
      code: d.code,
      nameEn: d.nameEn,
      nameTe: d.nameTe,
      busStandCount: d._count.busStands,
    }));
  }

  /** Null when the district does not exist. */
  async busStandsOfDistrict(districtId: string): Promise<BusStandDto[] | null> {
    const district = await this.prisma.district.findUnique({
      where: { id: districtId },
      select: {
        busStands: {
          select: { id: true, nameEn: true, nameTe: true, stops: { select: { id: true } } },
          orderBy: { nameEn: "asc" },
        },
      },
    });
    if (!district) return null;

    const allStopIds = district.busStands.flatMap((b) => b.stops.map((s) => s.id));
    const routes = await this.routesLeaving(allStopIds);
    return district.busStands.map((b) => {
      const stopIds = new Set(b.stops.map((s) => s.id));
      const routeIds = new Set(routes.filter((r) => stopIds.has(r.fromStopId)).map((r) => r.route.id));
      return { id: b.id, nameEn: b.nameEn, nameTe: b.nameTe, routeCount: routeIds.size };
    });
  }

  /** Null when the bus stand does not exist. */
  async routesOfBusStand(busStandId: string): Promise<BusStandRouteDto[] | null> {
    const busStand = await this.prisma.busStand.findUnique({
      where: { id: busStandId },
      select: { stops: { select: { id: true } } },
    });
    if (!busStand) return null;

    const seen = new Set<string>();
    const result: BusStandRouteDto[] = [];
    for (const { route } of await this.routesLeaving(busStand.stops.map((s) => s.id))) {
      if (seen.has(route.id)) continue;
      seen.add(route.id);
      result.push(route);
    }
    return result.sort((a, b) => a.code.localeCompare(b.code));
  }

  /** Active routes a passenger can board at one of these stops (the stop is not the route's last stop). */
  private async routesLeaving(stopIds: string[]): Promise<{ fromStopId: string; route: BusStandRouteDto }[]> {
    if (stopIds.length === 0) return [];
    const rows = await this.prisma.routeStop.findMany({
      where: { stopId: { in: stopIds }, isBoarding: true, route: { isActive: true } },
      select: {
        stopId: true,
        route: {
          select: {
            id: true,
            code: true,
            nameEn: true,
            nameTe: true,
            destinationStop: { select: { id: true, nameEn: true, nameTe: true } },
            timetables: { where: { isActive: true }, select: { busType: { select: { serviceType: true } } } },
          },
        },
      },
    });
    return rows
      .filter((rs) => rs.route.destinationStop.id !== rs.stopId)
      .map((rs) => ({
        fromStopId: rs.stopId,
        route: {
          id: rs.route.id,
          code: rs.route.code,
          nameEn: rs.route.nameEn,
          nameTe: rs.route.nameTe,
          destination: rs.route.destinationStop,
          serviceTypes: [...new Set(rs.route.timetables.map((t) => t.busType.serviceType))].sort(),
        },
      }));
  }

  /** Null when the route does not exist or is inactive. */
  async route(routeId: string): Promise<RouteDto | null> {
    const route = await this.prisma.route.findUnique({
      where: { id: routeId },
      select: {
        id: true,
        code: true,
        nameEn: true,
        nameTe: true,
        distanceKm: true,
        polyline: true,
        isActive: true,
        originStop: { select: { id: true, nameEn: true, nameTe: true } },
        destinationStop: { select: { id: true, nameEn: true, nameTe: true } },
        routeStops: {
          orderBy: { seq: "asc" },
          select: {
            seq: true,
            kmFromOrigin: true,
            minutesFromOrigin: true,
            isBoarding: true,
            isDropping: true,
            stop: { select: { id: true, nameEn: true, nameTe: true, lat: true, lng: true, busStandId: true } },
          },
        },
      },
    });
    if (!route || !route.isActive) return null;
    return {
      id: route.id,
      code: route.code,
      nameEn: route.nameEn,
      nameTe: route.nameTe,
      distanceKm: route.distanceKm,
      polyline: route.polyline,
      origin: route.originStop,
      destination: route.destinationStop,
      stops: route.routeStops.map((rs) => ({
        stopId: rs.stop.id,
        seq: rs.seq,
        nameEn: rs.stop.nameEn,
        nameTe: rs.stop.nameTe,
        kind: rs.stop.busStandId ? "BUS_STAND" : "STOP",
        lat: rs.stop.lat,
        lng: rs.stop.lng,
        kmFromOrigin: rs.kmFromOrigin,
        minutesFromOrigin: rs.minutesFromOrigin,
        isBoarding: rs.isBoarding,
        isDropping: rs.isDropping,
      })),
    };
  }

  /**
   * One round trip: trips on the service date whose route visits `from` before `to`, with the bus type
   * and the fare rule valid that day. Uses the (routeId, serviceDate) and route_stops (stopId) indexes.
   */
  async tripRows({ fromStopId, toStopId, serviceDate, routeId, includeCancelled = false }: TripRowsArgs): Promise<TripRow[]> {
    const rows = await this.prisma.$queryRaw<RawTripRow[]>`
      SELECT
        t.id AS "tripId",
        r.code AS "routeCode",
        bt."serviceType"::text AS "serviceType",
        bt."totalSeats" AS "totalSeats",
        bt."freeTravelEligible" AS "freeTravelEligible",
        t.status::text AS "status",
        t."delayMinutes" AS "delayMinutes",
        t."hasOpenIncident" AS "hasOpenIncident",
        (EXTRACT(EPOCH FROM t."scheduledDepartureAt") * 1000)::float8 AS "departureMs",
        rf."minutesFromOrigin" AS "fromMinutes",
        rt."minutesFromOrigin" AS "toMinutes",
        rf."kmFromOrigin" AS "fromKm",
        rt."kmFromOrigin" AS "toKm",
        fr."baseFarePaise" AS "baseFarePaise",
        fr."perKmPaise" AS "perKmPaise",
        fr."minFarePaise" AS "minFarePaise",
        fr."reservationFeePaise" AS "reservationFeePaise"
      FROM route_stops rf
      JOIN route_stops rt ON rt."routeId" = rf."routeId" AND rt."stopId" = ${toStopId} AND rt.seq > rf.seq AND rt."isDropping"
      JOIN routes r ON r.id = rf."routeId" AND r."isActive"
      JOIN trips t ON t."routeId" = r.id AND t."serviceDate" = CAST(${serviceDate} AS date)
      JOIN bus_types bt ON bt.id = t."busTypeId"
      LEFT JOIN LATERAL (
        SELECT f."baseFarePaise", f."perKmPaise", f."minFarePaise", f."reservationFeePaise"
        FROM fare_rules f
        WHERE f."busTypeId" = bt.id
          AND f."validFrom" <= t."scheduledDepartureAt"
          AND (f."validTo" IS NULL OR f."validTo" >= t."scheduledDepartureAt")
        ORDER BY f."validFrom" DESC
        LIMIT 1
      ) fr ON true
      WHERE rf."stopId" = ${fromStopId}
        AND rf."isBoarding"
        ${routeId ? Prisma.sql`AND r.id = ${routeId}` : Prisma.empty}
        ${includeCancelled ? Prisma.empty : Prisma.sql`AND t.status <> 'CANCELLED'`}
      ORDER BY t."scheduledDepartureAt" + rf."minutesFromOrigin" * interval '1 minute', t.id
    `;
    return rows.map((row) => ({
      tripId: row.tripId,
      routeCode: row.routeCode,
      serviceType: row.serviceType,
      totalSeats: row.totalSeats,
      freeTravelEligible: row.freeTravelEligible,
      status: row.status,
      delayMinutes: row.delayMinutes,
      hasOpenIncident: row.hasOpenIncident,
      departureMs: Number(row.departureMs),
      fromMinutes: row.fromMinutes,
      toMinutes: row.toMinutes,
      fromKm: Number(row.fromKm),
      toKm: Number(row.toKm),
      fare:
        row.perKmPaise === null
          ? null
          : {
              baseFarePaise: row.baseFarePaise ?? 0,
              perKmPaise: row.perKmPaise,
              minFarePaise: row.minFarePaise ?? 0,
              reservationFeePaise: row.reservationFeePaise ?? 0,
            },
    }));
  }

  /** Taken seats per trip, one grouped query. Trips with no tickets are missing from the map. */
  async seatsTaken(tripIds: string[]): Promise<Map<string, number>> {
    if (tripIds.length === 0) return new Map();
    const groups = await this.prisma.ticket.groupBy({
      by: ["tripId"],
      where: { tripId: { in: tripIds }, status: { in: [...SEAT_TAKING_STATUSES] } },
      _count: { _all: true },
    });
    return new Map(groups.map((g) => [g.tripId, g._count._all]));
  }

  /** A numeric setting (docs/07 section 1), or null when missing or not a number. */
  async settingNumber(key: string): Promise<number | null> {
    const row = await this.prisma.setting.findUnique({ where: { key }, select: { value: true } });
    return typeof row?.value === "number" ? row.value : null;
  }
}
