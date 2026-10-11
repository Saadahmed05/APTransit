import { deriveTripDisplayStatus, type DisplayStatus, formatIstDate, type TripDto } from "@aptransit/shared";
import { Injectable } from "@nestjs/common";
import { AppError } from "../../common/errors/app-error";
import type { LiveRooms } from "../../common/events/domain-events.service";
import { PrismaService } from "../../prisma/prisma.service";
import { buildRouteGeometry, type RouteGeometry, type RouteStopRef } from "./progress";

export interface ContextStop extends RouteStopRef {
  nameEn: string;
  nameTe: string;
}

export interface TripContext {
  trip: {
    id: string;
    code: string;
    status: TripDto["status"];
    serviceDate: Date;
    scheduledDepartureAt: Date;
    scheduledArrivalAt: Date;
    actualDepartureAt: Date | null;
    actualArrivalAt: Date | null;
    delayMinutes: number;
    lastStopSeq: number | null;
    hasOpenIncident: boolean;
  };
  route: { id: string; code: string; nameEn: string; nameTe: string; distanceKm: number; polyline: string; depotId: string; depotCode: string; districtId: string };
  /** The state of the route's district (D-034): its id for the state room, its box for GPS trust. */
  state: StateGeo;
  stops: ContextStop[];
  /** The open assignment (endedAt null), if any. */
  assignment: { id: string; busId: string; busRegNo: string; driverId: string; driverUserId: string } | null;
}

const TRIP_INCLUDE = {
  route: {
    include: {
      depot: { select: { id: true, code: true, districtId: true } },
      routeStops: { include: { stop: { select: { nameEn: true, nameTe: true, lat: true, lng: true } } }, orderBy: { seq: "asc" as const } },
    },
  },
  assignments: {
    where: { endedAt: null },
    take: 1,
    include: { bus: { select: { id: true, regNo: true } }, driver: { select: { id: true, userId: true } } },
  },
};

interface LoadedTrip {
  id: string;
  code: string;
  status: TripDto["status"];
  serviceDate: Date;
  scheduledDepartureAt: Date;
  scheduledArrivalAt: Date;
  actualDepartureAt: Date | null;
  actualArrivalAt: Date | null;
  delayMinutes: number;
  lastStopSeq: number | null;
  hasOpenIncident: boolean;
  route: {
    id: string;
    code: string;
    nameEn: string;
    nameTe: string;
    distanceKm: number;
    polyline: string;
    depot: { id: string; code: string; districtId: string };
    routeStops: { stopId: string; seq: number; kmFromOrigin: number; minutesFromOrigin: number; stop: { nameEn: string; nameTe: string; lat: number; lng: number } }[];
  };
  assignments: { id: string; bus: { id: string; regNo: string }; driver: { id: string; userId: string } }[];
}

export function toTripDto(trip: TripContext["trip"]): TripDto {
  return {
    id: trip.id,
    code: trip.code,
    status: trip.status,
    displayStatus: displayStatusOf(trip),
    serviceDate: formatIstDate(trip.serviceDate),
    scheduledDepartureAt: trip.scheduledDepartureAt.toISOString(),
    scheduledArrivalAt: trip.scheduledArrivalAt.toISOString(),
    actualDepartureAt: trip.actualDepartureAt?.toISOString() ?? null,
    actualArrivalAt: trip.actualArrivalAt?.toISOString() ?? null,
    delayMinutes: trip.delayMinutes,
  };
}

export function displayStatusOf(trip: Pick<TripContext["trip"], "status" | "delayMinutes" | "hasOpenIncident">): DisplayStatus {
  return deriveTripDisplayStatus({ status: trip.status, delayMinutes: trip.delayMinutes, hasOpenIncident: trip.hasOpenIncident });
}

export function roomsOf(context: TripContext): LiveRooms {
  return {
    tripId: context.trip.id,
    routeId: context.route.id,
    depotId: context.route.depotId,
    districtId: context.route.districtId,
    stateId: context.state.id,
  };
}

export interface StateGeo {
  id: string;
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

/** States change only through a migration or the seed; a short cache keeps pings off the database. */
const STATE_CACHE_MS = 5 * 60_000;

/** Loads a trip with its route, stops, depot and open assignment. Route geometry is cached per route. */
@Injectable()
export class TripContextService {
  private readonly geometries = new Map<string, { polyline: string; geometry: RouteGeometry }>();
  private readonly states = new Map<string, { at: number; state: StateGeo }>();

  constructor(private readonly prisma: PrismaService) {}

  async load(tripId: string): Promise<TripContext> {
    const trip = (await this.prisma.trip.findUnique({ where: { id: tripId }, include: TRIP_INCLUDE })) as unknown as LoadedTrip | null;
    if (!trip) throw new AppError("NOT_FOUND", "Trip not found");
    const assignment = trip.assignments[0];
    const state = await this.stateOf(trip.route.depot.districtId);
    return {
      trip: {
        id: trip.id,
        code: trip.code,
        status: trip.status,
        serviceDate: trip.serviceDate,
        scheduledDepartureAt: trip.scheduledDepartureAt,
        scheduledArrivalAt: trip.scheduledArrivalAt,
        actualDepartureAt: trip.actualDepartureAt,
        actualArrivalAt: trip.actualArrivalAt,
        delayMinutes: trip.delayMinutes,
        lastStopSeq: trip.lastStopSeq,
        hasOpenIncident: trip.hasOpenIncident,
      },
      route: {
        id: trip.route.id,
        code: trip.route.code,
        nameEn: trip.route.nameEn,
        nameTe: trip.route.nameTe,
        distanceKm: trip.route.distanceKm,
        polyline: trip.route.polyline,
        depotId: trip.route.depot.id,
        depotCode: trip.route.depot.code,
        districtId: trip.route.depot.districtId,
      },
      state,
      stops: trip.route.routeStops.map((rs) => ({
        stopId: rs.stopId,
        seq: rs.seq,
        kmFromOrigin: rs.kmFromOrigin,
        minutesFromOrigin: rs.minutesFromOrigin,
        lat: rs.stop.lat,
        lng: rs.stop.lng,
        nameEn: rs.stop.nameEn,
        nameTe: rs.stop.nameTe,
      })),
      assignment: assignment
        ? { id: assignment.id, busId: assignment.bus.id, busRegNo: assignment.bus.regNo, driverId: assignment.driver.id, driverUserId: assignment.driver.userId }
        : null,
    };
  }

  /** The state of a district with its bounding box, cached per district. */
  async stateOf(districtId: string, now = Date.now()): Promise<StateGeo> {
    const cached = this.states.get(districtId);
    if (cached && now - cached.at < STATE_CACHE_MS) return cached.state;
    const district = await this.prisma.district.findUnique({
      where: { id: districtId },
      select: { state: { select: { id: true, minLat: true, minLng: true, maxLat: true, maxLng: true } } },
    });
    if (!district?.state) throw new AppError("NOT_FOUND", "State of the district not found");
    this.states.set(districtId, { at: now, state: district.state });
    return district.state;
  }

  geometry(context: TripContext): RouteGeometry {
    const cached = this.geometries.get(context.route.id);
    if (cached && cached.polyline === context.route.polyline) return cached.geometry;
    const geometry = buildRouteGeometry(context.route.polyline, context.route.distanceKm, context.stops);
    this.geometries.set(context.route.id, { polyline: context.route.polyline, geometry });
    return geometry;
  }
}
