import {
  DELAY_DISPLAY_THRESHOLD_MIN,
  formatIstDate,
  type GovDepotSummaryDto,
  type GovDistrictSummaryDto,
  type GovMapDto,
  type GovOverviewDto,
  type GovRouteSummaryDto,
  type IncidentDto,
  type OpsTripDto,
} from "@aptransit/shared";
import { Injectable } from "@nestjs/common";
import type { AuthenticatedUser } from "../../common/auth/auth.types";
import { AppError } from "../../common/errors/app-error";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { calculateLoadFactor, type DailyStatsRow, serviceDateOf } from "../rollups/rollups.service";
import { type AnalyticsScope, AnalyticsService, complaintScopeOf } from "../analytics/analytics.service";
import { displayStatusOf, toTripDto } from "../tracking/trip-context.service";
import { TrackingService } from "../tracking/tracking.service";

const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_INCIDENT = ["OPEN", "ACKNOWLEDGED"] as const;
const SEATED = ["CANCELLED", "REFUNDED"] as const;

/** Counts for a set of trips of one service date. */
interface TripCounts {
  activeTrips: number;
  activeBuses: number;
  delayedTrips: number;
}

const tripSelect = {
  id: true,
  status: true,
  delayMinutes: true,
  route: { select: { depotId: true, depot: { select: { districtId: true } } } },
  assignments: { where: { endedAt: null }, select: { busId: true } },
} as const satisfies Prisma.TripSelect;
type TripRow = Prisma.TripGetPayload<{ select: typeof tripSelect }>;

/**
 * Active trips are RUNNING now, active buses are the buses on them, delayed trips are trips of the
 * date that were not cancelled and are 5 minutes or more late (the DELAYED display threshold).
 */
export function countTrips(trips: readonly TripRow[]): TripCounts {
  const running = trips.filter((t) => t.status === "RUNNING");
  return {
    activeTrips: running.length,
    activeBuses: new Set(running.flatMap((t) => t.assignments.map((a) => a.busId))).size,
    delayedTrips: trips.filter((t) => t.status !== "CANCELLED" && t.delayMinutes >= DELAY_DISPLAY_THRESHOLD_MIN).length,
  };
}

/** Sums rollup rows (one level only) into the totals the summaries show. */
export function sumRows(rows: readonly DailyStatsRow[]) {
  let completed = 0;
  let onTime = 0;
  let passengers = 0;
  let tickets = 0;
  let revenue = 0n;
  for (const r of rows) {
    completed += r.tripsCompleted;
    onTime += (r.onTimePct / 100) * r.tripsCompleted;
    passengers += r.passengers;
    tickets += r.ticketsSold;
    revenue += r.revenuePaise;
  }
  return {
    passengers,
    tickets,
    revenuePaise: Number(revenue),
    onTimePct: completed ? Math.round((onTime / completed) * 1000) / 10 : 100,
  };
}

/**
 * Rows that cover the caller's scope exactly once: every state row for platform roles, the state
 * row of each whole state in scope, else the district rows of whole districts in scope plus depot
 * rows for any other depot in scope.
 */
export function areaRows(scope: AnalyticsScope, rows: readonly DailyStatsRow[], depotDistrict: ReadonlyMap<string, string>) {
  const isStateRow = (r: DailyStatsRow) => !r.routeId && !r.depotId && !r.districtId;
  if (scope.all) return rows.filter(isStateRow);
  const states = new Set(scope.stateIds);
  const districts = new Set(scope.districtIds);
  return rows.filter((r) => {
    if (r.routeId) return false;
    if (r.stateId && states.has(r.stateId)) return isStateRow(r);
    if (!r.depotId) return r.districtId !== null && districts.has(r.districtId);
    return scope.depotIds.includes(r.depotId) && !districts.has(depotDistrict.get(r.depotId) ?? "");
  });
}

/**
 * Government command center and drill down (docs/06 "Government and analytics", plan sec 35, 36).
 * Ticket, passenger, revenue and on time numbers come from the rollup rows (stored for past dates,
 * computed live for today), so the command center, drill down and analytics always agree.
 */
@Injectable()
export class GovService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
    private readonly tracking: TrackingService,
  ) {}

  /** The caller's scope, narrowed to one state when the state picker sent one (D-034). */
  private async scope(user: AuthenticatedUser, stateId?: string): Promise<AnalyticsScope> {
    const scope = await this.analytics.scopeFor(user);
    return stateId ? this.analytics.narrowToState(scope, stateId) : scope;
  }

  /** GET /gov/overview */
  async overview(user: AuthenticatedUser, dateStr?: string, stateId?: string): Promise<GovOverviewDto> {
    const date = dateStr ?? formatIstDate(new Date());
    const scope = await this.scope(user, stateId);
    const depotFilter = scope.all ? {} : { depotId: { in: scope.depotIds } };
    const since = new Date(Date.now() - 30 * DAY_MS);
    const range = this.analytics.range(date, date);

    const [trips, rows, depots, openIncidents, complaintsToday, openComplaints, resolved] = await Promise.all([
      this.trips(date, scope.depotIds),
      this.analytics.statsRows(range),
      this.prisma.depot.findMany({ select: { id: true, districtId: true } }),
      this.prisma.incident.count({ where: { status: { in: [...OPEN_INCIDENT] }, trip: { route: depotFilter } } }),
      this.prisma.complaint.count({ where: { ...this.complaintScope(scope), createdAt: { gte: range.start, lt: range.end } } }),
      this.prisma.complaint.count({ where: { ...this.complaintScope(scope), status: { in: ["RECEIVED", "IN_REVIEW"] } } }),
      this.prisma.complaint.findMany({
        where: { ...this.complaintScope(scope), resolvedAt: { not: null, gte: since } },
        select: { createdAt: true, resolvedAt: true },
      }),
    ]);
    const totals = sumRows(areaRows(scope, rows, new Map(depots.map((d) => [d.id, d.districtId]))));
    const hours = resolved.map((c) => (c.resolvedAt!.getTime() - c.createdAt.getTime()) / 3_600_000);

    return {
      ...countTrips(trips),
      openIncidents,
      passengersToday: totals.passengers,
      ticketsToday: totals.tickets,
      revenueTodayPaise: totals.revenuePaise,
      onTimePct: totals.onTimePct,
      complaintsToday,
      openComplaints,
      avgHoursToResolve: hours.length ? Math.round((hours.reduce((s, h) => s + h, 0) / hours.length) * 10) / 10 : null,
    };
  }

  /** GET /gov/map: per district HQ live counts, live buses and open incidents in scope. */
  async map(user: AuthenticatedUser, stateId?: string): Promise<GovMapDto> {
    const scope = await this.scope(user, stateId);
    const today = formatIstDate(new Date());
    const [districts, trips, incidents, buses] = await Promise.all([
      this.prisma.district.findMany({
        where: { depots: { some: { id: { in: scope.depotIds } } } },
        select: {
          id: true,
          code: true,
          nameEn: true,
          nameTe: true,
          depots: { select: { busStand: { select: { lat: true, lng: true } } }, orderBy: { code: "asc" }, take: 1 },
        },
        orderBy: { code: "asc" },
      }),
      this.trips(today, scope.depotIds),
      this.prisma.incident.findMany({
        where: { status: { in: [...OPEN_INCIDENT] }, trip: { route: { depotId: { in: scope.depotIds } } } },
        include: {
          trip: { select: { code: true, route: { select: { depot: { select: { districtId: true } } } } } },
          bus: { select: { regNo: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      this.tracking.liveBuses(user, undefined, undefined),
    ]);

    const inScope = new Set(scope.depotIds);
    return {
      districts: districts.map((d) => {
        const own = trips.filter((t) => t.route.depot.districtId === d.id);
        const running = own.filter((t) => t.status === "RUNNING");
        return {
          id: d.id,
          code: d.code,
          nameEn: d.nameEn,
          nameTe: d.nameTe,
          activeBuses: countTrips(own).activeBuses,
          // On the live map "delayed" means running late right now
          delayed: running.filter((t) => t.delayMinutes >= DELAY_DISPLAY_THRESHOLD_MIN).length,
          incidents: incidents.filter((i) => i.trip.route.depot.districtId === d.id).length,
          lat: d.depots[0]?.busStand.lat ?? null,
          lng: d.depots[0]?.busStand.lng ?? null,
        };
      }),
      buses: buses.filter((b) => inScope.has(b.depotId)),
      incidents: incidents.map(
        (inc): IncidentDto => ({
          id: inc.id,
          code: inc.code,
          type: inc.type,
          severity: inc.severity,
          status: inc.status,
          tripId: inc.tripId,
          tripCode: inc.trip.code,
          busId: inc.busId,
          busRegNo: inc.bus.regNo,
          lat: inc.lat,
          lng: inc.lng,
          note: inc.note,
          createdAt: inc.createdAt.toISOString(),
        }),
      ),
    };
  }

  /** GET /gov/districts/:id */
  async districtSummary(user: AuthenticatedUser, districtId: string, dateStr?: string): Promise<GovDistrictSummaryDto> {
    const date = dateStr ?? formatIstDate(new Date());
    const scope = await this.analytics.scopeFor(user);
    const district = await this.prisma.district.findUnique({
      where: { id: districtId },
      include: { depots: { include: { buses: { select: { id: true } } }, orderBy: { code: "asc" } } },
    });
    if (!district) throw new AppError("NOT_FOUND", "District not found");
    if (!scope.all && !scope.districtIds.includes(districtId)) {
      throw new AppError("FORBIDDEN", "District is outside your scope");
    }
    const depotIds = district.depots.map((d) => d.id);
    const [trips, rows, openIncidents] = await Promise.all([
      this.trips(date, depotIds),
      this.analytics.statsRows(this.analytics.range(date, date)),
      this.prisma.incident.count({
        where: { status: { in: [...OPEN_INCIDENT] }, trip: { route: { depot: { districtId } } } },
      }),
    ]);
    const totals = sumRows(rows.filter((r) => !r.routeId && !r.depotId && r.districtId === districtId));

    return {
      id: district.id,
      code: district.code,
      nameEn: district.nameEn,
      nameTe: district.nameTe,
      ...countTrips(trips),
      openIncidents,
      passengersToday: totals.passengers,
      onTimePct: totals.onTimePct,
      revenueTodayPaise: totals.revenuePaise,
      depots: district.depots.map((depot) => ({
        id: depot.id,
        code: depot.code,
        nameEn: depot.nameEn,
        nameTe: depot.nameTe,
        ...countTrips(trips.filter((t) => t.route.depotId === depot.id)),
        totalBuses: depot.buses.length,
      })),
    };
  }

  /** GET /gov/depots/:id */
  async depotSummary(user: AuthenticatedUser, depotId: string, dateStr?: string): Promise<GovDepotSummaryDto> {
    const date = dateStr ?? formatIstDate(new Date());
    const scope = await this.analytics.scopeFor(user);
    const depot = await this.prisma.depot.findUnique({
      where: { id: depotId },
      include: {
        buses: { select: { id: true } },
        routes: { select: { id: true, code: true, nameEn: true, nameTe: true }, orderBy: { code: "asc" } },
      },
    });
    if (!depot) throw new AppError("NOT_FOUND", "Depot not found");
    if (!scope.depotIds.includes(depotId)) throw new AppError("FORBIDDEN", "Depot is outside your scope");

    const serviceDate = serviceDateOf(date);
    const [trips, load] = await Promise.all([
      this.trips(date, [depotId]),
      this.prisma.trip.findMany({
        where: { serviceDate, route: { depotId }, status: { not: "CANCELLED" } },
        select: {
          routeId: true,
          delayMinutes: true,
          busType: { select: { totalSeats: true } },
          _count: { select: { tickets: { where: { status: { notIn: [...SEATED] } } } } },
        },
      }),
    ]);
    const allTrips = await this.prisma.trip.groupBy({
      by: ["routeId"],
      where: { serviceDate, route: { depotId } },
      _count: { _all: true },
    });
    const tripCount = new Map(allTrips.map((r) => [r.routeId, r._count._all]));

    return {
      id: depot.id,
      code: depot.code,
      nameEn: depot.nameEn,
      nameTe: depot.nameTe,
      districtId: depot.districtId,
      ...countTrips(trips),
      totalBuses: depot.buses.length,
      routes: depot.routes.map((route) => {
        const own = load.filter((t) => t.routeId === route.id);
        return {
          id: route.id,
          code: route.code,
          nameEn: route.nameEn,
          nameTe: route.nameTe,
          tripsToday: tripCount.get(route.id) ?? 0,
          delayedTrips: own.filter((t) => t.delayMinutes >= DELAY_DISPLAY_THRESHOLD_MIN).length,
          loadFactorPct: calculateLoadFactor(
            own.reduce((s, t) => s + t._count.tickets, 0),
            own.reduce((s, t) => s + t.busType.totalSeats, 0),
          ),
        };
      }),
    };
  }

  /** GET /gov/routes/:id: the route's trips of the date with their bus and crew. */
  async routeSummary(user: AuthenticatedUser, routeId: string, dateStr?: string): Promise<GovRouteSummaryDto> {
    const date = dateStr ?? formatIstDate(new Date());
    const scope = await this.analytics.scopeFor(user);
    const route = await this.prisma.route.findUnique({
      where: { id: routeId },
      select: { id: true, code: true, nameEn: true, nameTe: true, depotId: true },
    });
    if (!route) throw new AppError("NOT_FOUND", "Route not found");
    if (!scope.depotIds.includes(route.depotId)) throw new AppError("FORBIDDEN", "Route is outside your scope");

    const trips = await this.prisma.trip.findMany({
      where: { routeId, serviceDate: serviceDateOf(date) },
      include: {
        busType: { select: { totalSeats: true } },
        assignments: {
          orderBy: { startedAt: "desc" },
          include: { bus: true, driver: { include: { user: true } }, conductor: { include: { user: true } } },
        },
        _count: { select: { tickets: { where: { status: { notIn: [...SEATED] } } } } },
      },
      orderBy: { scheduledDepartureAt: "asc" },
    });

    const ran = trips.filter((t) => t.status !== "CANCELLED");
    const items: OpsTripDto[] = trips.map((t) => {
      // The open assignment while the trip runs, else the last one (who finished the trip)
      const a = t.assignments.find((x) => !x.endedAt) ?? t.assignments[0];
      return {
        ...toTripDto(t),
        displayStatus: displayStatusOf(t),
        routeId: route.id,
        routeNameEn: route.nameEn,
        routeNameTe: route.nameTe,
        depotId: route.depotId,
        passengers: t._count.tickets,
        assignment: a
          ? {
              id: a.id,
              busId: a.busId,
              busRegNo: a.bus.regNo,
              driverId: a.driverId,
              driverName: a.driver.user.name,
              conductorId: a.conductorId,
              conductorName: a.conductor?.user.name ?? null,
              reason: a.reason,
              startedAt: a.startedAt.toISOString(),
              endedAt: a.endedAt?.toISOString() ?? null,
            }
          : null,
      };
    });

    return {
      id: route.id,
      code: route.code,
      depotId: route.depotId,
      nameEn: route.nameEn,
      nameTe: route.nameTe,
      tripsToday: trips.length,
      delayedTrips: ran.filter((t) => t.delayMinutes >= DELAY_DISPLAY_THRESHOLD_MIN).length,
      loadFactorPct: calculateLoadFactor(
        ran.reduce((s, t) => s + t._count.tickets, 0),
        ran.reduce((s, t) => s + t.busType.totalSeats, 0),
      ),
      busesOnRoute: countTrips(trips.map((t) => ({ ...t, route: { depotId: route.depotId, depot: { districtId: "" } } }))).activeBuses,
      trips: items,
    };
  }

  private trips(date: string, depotIds: string[]): Promise<TripRow[]> {
    return this.prisma.trip.findMany({
      where: { serviceDate: serviceDateOf(date), route: { depotId: { in: depotIds } } },
      select: tripSelect,
    });
  }

  /** Complaints of depots in scope; state and platform roles also see complaints without a depot. */
  private complaintScope(scope: AnalyticsScope): Prisma.ComplaintWhereInput {
    return complaintScopeOf(scope);
  }
}
