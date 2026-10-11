import {
  type BusAnalyticsDto,
  type DelayAnalyticsDto,
  type DemandBandDto,
  demandBandOfHour,
  demandLevelOf,
  formatIstDate,
  localTimeToUtc,
  type PassengerAnalyticsDto,
  PLATFORM_TIME_ZONE,
  type Permission,
  type RouteAnalyticsDto,
} from "@aptransit/shared";
import { Injectable } from "@nestjs/common";
import type { AuthenticatedUser } from "../../common/auth/auth.types";
import { AppError } from "../../common/errors/app-error";
import { depotScopeWhere, isPlatformWide, wholeStates } from "../../common/services/scope.service";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  calculateLoadFactor,
  type DailyStatsRow,
  RollupsService,
  serviceDateOf,
} from "../rollups/rollups.service";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
/** Longest range one analytics call may cover. History is 14 days; a quarter leaves room. */
const MAX_RANGE_DAYS = 92;
/** The platform zone as an SQL literal for AT TIME ZONE (a constant, never user input). */
const TZ_SQL = Prisma.raw(`'${PLATFORM_TIME_ZONE}'`);

/** The depots a caller may see for gov:read; `all` is true for platform wide roles (SUPER_ADMIN). */
export interface AnalyticsScope {
  all: boolean;
  /** States the caller sees whole (state roles, or one picked state), so state rows may be shown. */
  stateIds: string[];
  depotIds: string[];
  /** Districts whose every depot is in scope, so district level rows may be shown. */
  districtIds: string[];
}

/** Complaints in scope. A complaint without a depot has no place: state and platform roles see it. */
export function complaintScopeOf(scope: AnalyticsScope): Prisma.ComplaintWhereInput {
  if (scope.all) return {};
  return scope.stateIds.length
    ? { OR: [{ depotId: { in: scope.depotIds } }, { depotId: null }] }
    : { depotId: { in: scope.depotIds } };
}

export interface Range {
  from: string;
  to: string;
  fromDate: Date;
  toDate: Date;
  /** IST midnight at the start of `from` and the end of `to`, the latter capped at now. */
  start: Date;
  end: Date;
  days: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Analytics for the government screens (docs/06 "Government and analytics", plan sec 37 to 39).
 * Past days read daily_stats; today is computed live with the same rollup code, so a range that
 * includes today never mixes two sets of rules. Every number comes from the records.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rollups: RollupsService,
  ) {}

  /** Depots and whole districts the caller may see for one permission (gov:read unless given). */
  async scopeFor(user: AuthenticatedUser, permission: Permission = "gov:read"): Promise<AnalyticsScope> {
    const where = depotScopeWhere(user, permission);
    const all = isPlatformWide(user, permission);
    const [inScope, everyDepot] = await Promise.all([
      this.prisma.depot.findMany({ where, select: { id: true, districtId: true } }),
      all ? Promise.resolve([]) : this.prisma.depot.findMany({ select: { id: true, districtId: true } }),
    ]);
    const depotIds = inScope.map((d) => d.id);
    const allowed = new Set(depotIds);
    const districts = new Set(inScope.map((d) => d.districtId));
    if (!all) {
      for (const d of everyDepot) if (!allowed.has(d.id)) districts.delete(d.districtId);
    }
    return { all, stateIds: wholeStates(user, permission) ?? [], depotIds, districtIds: [...districts] };
  }

  /**
   * One state of the caller's scope (the gov state picker). The caller must reach the whole
   * state (SUPER_ADMIN or a role on that state); the result covers only that state.
   */
  async narrowToState(scope: AnalyticsScope, stateId: string): Promise<AnalyticsScope> {
    if (!scope.all && !scope.stateIds.includes(stateId)) throw new AppError("FORBIDDEN", "State is outside your scope");
    const depots = await this.prisma.depot.findMany({ where: { district: { stateId } }, select: { id: true, districtId: true } });
    return {
      all: false,
      stateIds: [stateId],
      depotIds: depots.map((d) => d.id),
      districtIds: [...new Set(depots.map((d) => d.districtId))],
    };
  }

  /** GET /analytics/routes: per route passengers, trips, load factor, delay, cancellations, revenue. */
  async routes(user: AuthenticatedUser, from: string, to: string, districtId?: string): Promise<RouteAnalyticsDto[]> {
    const scope = await this.scopeFor(user);
    return this.routesIn(await this.narrowToDistrict(scope, districtId), this.range(from, to));
  }

  /** Route analytics for a set of depots (also used by the route performance report). */
  async routesIn(depotIds: string[], range: Range): Promise<RouteAnalyticsDto[]> {
    const routes = await this.prisma.route.findMany({
      where: { depotId: { in: depotIds } },
      select: { id: true, code: true, nameEn: true, nameTe: true },
      orderBy: { code: "asc" },
    });
    const rows = (await this.statsRows(range)).filter((r) => r.routeId && depotIds.includes(r.depotId ?? ""));
    const seats = await this.seatsByRoute(range, routes.map((r) => r.id));

    return routes.map((route) => {
      const own = rows.filter((r) => r.routeId === route.id);
      const completed = own.reduce((s, r) => s + r.tripsCompleted, 0);
      const delaySum = own.reduce((s, r) => s + r.avgDelayMin * r.tripsCompleted, 0);
      return {
        routeId: route.id,
        routeCode: route.code,
        routeNameEn: route.nameEn,
        routeNameTe: route.nameTe,
        passengers: own.reduce((s, r) => s + r.passengers, 0),
        trips: own.reduce((s, r) => s + r.tripsScheduled, 0),
        loadFactorPct: calculateLoadFactor(own.reduce((s, r) => s + r.ticketsSold, 0), seats.get(route.id) ?? 0),
        avgDelayMin: completed ? round1(delaySum / completed) : 0,
        cancellations: own.reduce((s, r) => s + r.tripsCancelled, 0),
        revenuePaise: Number(own.reduce((s, r) => s + r.revenuePaise, 0n)),
      };
    });
  }

  /**
   * GET /analytics/buses: completed trips, km, utilisation and downtime per bus.
   * Utilisation = hours on completed trips over the hours in the range that were not downtime.
   * Downtime = maintenance records plus breakdown incidents (report to resolution), clipped to the range.
   * A trip that changed bus counts for each bus in proportion to the time it drove.
   */
  async buses(user: AuthenticatedUser, from: string, to: string, depotId?: string): Promise<BusAnalyticsDto[]> {
    const range = this.range(from, to);
    const scope = await this.scopeFor(user);
    if (depotId && !scope.depotIds.includes(depotId)) throw new AppError("FORBIDDEN", "Depot is outside your scope");
    const depotIds = depotId ? [depotId] : scope.depotIds;

    const buses = await this.prisma.bus.findMany({
      where: { depotId: { in: depotIds } },
      select: { id: true, regNo: true, depotId: true, busType: { select: { nameEn: true } } },
      orderBy: { regNo: "asc" },
    });
    const busIds = buses.map((b) => b.id);
    const [assignments, maintenance, breakdowns] = await Promise.all([
      this.prisma.tripAssignment.findMany({
        where: {
          busId: { in: busIds },
          trip: { serviceDate: { gte: range.fromDate, lte: range.toDate }, status: "COMPLETED" },
        },
        select: {
          busId: true,
          startedAt: true,
          endedAt: true,
          trip: {
            select: {
              scheduledDepartureAt: true,
              scheduledArrivalAt: true,
              delayMinutes: true,
              route: { select: { distanceKm: true } },
            },
          },
        },
      }),
      this.prisma.maintenanceRecord.findMany({
        where: { busId: { in: busIds }, startAt: { lt: range.end }, OR: [{ endAt: null }, { endAt: { gt: range.start } }] },
        select: { busId: true, startAt: true, endAt: true },
      }),
      this.prisma.incident.findMany({
        where: {
          busId: { in: busIds },
          type: "BREAKDOWN",
          createdAt: { lt: range.end },
          OR: [{ resolvedAt: null }, { resolvedAt: { gt: range.start } }],
        },
        select: { busId: true, createdAt: true, resolvedAt: true },
      }),
    ]);

    const clip = (a: Date, b: Date | null) =>
      Math.max(0, Math.min((b ?? range.end).getTime(), range.end.getTime()) - Math.max(a.getTime(), range.start.getTime()));
    const rangeMs = range.end.getTime() - range.start.getTime();

    return buses.map((bus) => {
      let trips = 0;
      let km = 0;
      let drivenMs = 0;
      for (const a of assignments) {
        if (a.busId !== bus.id) continue;
        const tripMs = a.trip.scheduledArrivalAt.getTime() - a.trip.scheduledDepartureAt.getTime();
        const ended = a.endedAt ?? new Date(a.trip.scheduledArrivalAt.getTime() + a.trip.delayMinutes * 60_000);
        const ms = Math.max(0, ended.getTime() - a.startedAt.getTime());
        trips++;
        drivenMs += ms;
        km += tripMs > 0 ? a.trip.route.distanceKm * Math.min(1, ms / tripMs) : 0;
      }
      let downMs = 0;
      for (const m of maintenance) if (m.busId === bus.id) downMs += clip(m.startAt, m.endAt);
      for (const b of breakdowns) if (b.busId === bus.id) downMs += clip(b.createdAt, b.resolvedAt);
      downMs = Math.min(downMs, rangeMs);
      const availableMs = rangeMs - downMs;
      return {
        busId: bus.id,
        registrationNumber: bus.regNo,
        busType: bus.busType.nameEn,
        depotId: bus.depotId,
        trips,
        km: round1(km),
        utilisationPct: availableMs > 0 ? Math.min(100, round1((drivenMs / availableMs) * 100)) : 0,
        downtimeHours: round1(downMs / HOUR_MS),
      };
    });
  }

  /** GET /analytics/passengers: tickets sold, valid pass scans, tickets by IST departure hour, top routes. */
  async passengers(user: AuthenticatedUser, from: string, to: string): Promise<PassengerAnalyticsDto> {
    const range = this.range(from, to);
    const scope = await this.scopeFor(user);
    const [rows, hours, passUsage, routes] = await Promise.all([
      this.statsRows(range),
      this.prisma.$queryRaw<Array<{ hour: number; tickets: bigint }>>(Prisma.sql`
        SELECT EXTRACT(HOUR FROM (t."scheduledDepartureAt" AT TIME ZONE 'UTC' AT TIME ZONE ${TZ_SQL}))::int AS hour,
               COUNT(*)::bigint AS tickets
        FROM tickets k JOIN trips t ON t.id = k."tripId" JOIN routes r ON r.id = t."routeId"
        WHERE t."serviceDate" BETWEEN ${range.fromDate} AND ${range.toDate}
          AND k.status NOT IN ('CANCELLED', 'REFUNDED')
          AND (${scope.all} OR r."depotId" = ANY(${scope.depotIds}))
        GROUP BY 1`),
      this.prisma.ticketScan.count({
        where: {
          passId: { not: null },
          result: "VALID",
          trip: {
            serviceDate: { gte: range.fromDate, lte: range.toDate },
            ...(scope.all ? {} : { route: { depotId: { in: scope.depotIds } } }),
          },
        },
      }),
      this.prisma.route.findMany({ select: { id: true, code: true } }),
    ]);
    const routeRows = rows.filter((r) => r.routeId && scope.depotIds.includes(r.depotId ?? ""));

    const busyHours = Array.from({ length: 24 }, () => 0);
    for (const h of hours) busyHours[h.hour] = Number(h.tickets);
    const byRoute = new Map<string, number>();
    for (const r of routeRows) byRoute.set(r.routeId!, (byRoute.get(r.routeId!) ?? 0) + r.passengers);
    const codeOf = new Map(routes.map((r) => [r.id, r.code]));
    const perDay = new Map<string, { ticketsSold: number; passengers: number }>();
    for (let d = new Date(range.fromDate); d <= range.toDate; d = new Date(d.getTime() + DAY_MS)) {
      perDay.set(d.toISOString().slice(0, 10), { ticketsSold: 0, passengers: 0 });
    }
    for (const r of routeRows) {
      const day = perDay.get(r.date.toISOString().slice(0, 10));
      if (!day) continue;
      day.ticketsSold += r.ticketsSold;
      day.passengers += r.passengers;
    }

    return {
      ticketsSold: routeRows.reduce((s, r) => s + r.ticketsSold, 0),
      passUsage,
      busyHours,
      daily: [...perDay.entries()].map(([date, v]) => ({ date, ...v })),
      topRoutes: [...byRoute.entries()]
        .map(([routeId, passengers]) => ({ routeId, routeCode: codeOf.get(routeId) ?? "", passengers }))
        .sort((a, b) => b.passengers - a.passengers || a.routeCode.localeCompare(b.routeCode))
        .slice(0, 5),
    };
  }

  /** GET /analytics/delays: average delay of completed trips by IST departure hour, and the five worst routes. */
  async delays(user: AuthenticatedUser, from: string, to: string, routeId?: string): Promise<DelayAnalyticsDto> {
    const range = this.range(from, to);
    const scope = await this.scopeFor(user);
    if (routeId) await this.assertRoute(scope, routeId);

    const [byHour, byRoute] = await Promise.all([
      this.prisma.$queryRaw<Array<{ hour: number; avg: number }>>(Prisma.sql`
        SELECT EXTRACT(HOUR FROM (t."scheduledDepartureAt" AT TIME ZONE 'UTC' AT TIME ZONE ${TZ_SQL}))::int AS hour,
               AVG(t."delayMinutes")::float8 AS avg
        FROM trips t JOIN routes r ON r.id = t."routeId"
        WHERE t."serviceDate" BETWEEN ${range.fromDate} AND ${range.toDate} AND t.status = 'COMPLETED'
          AND (${routeId ?? null}::text IS NULL OR t."routeId" = ${routeId ?? null})
          AND (${scope.all} OR r."depotId" = ANY(${scope.depotIds}))
        GROUP BY 1`),
      this.prisma.$queryRaw<Array<{ routeId: string; routeCode: string; hour: number; total: number; trips: bigint }>>(Prisma.sql`
        SELECT r.id AS "routeId", r.code AS "routeCode",
               EXTRACT(HOUR FROM (t."scheduledDepartureAt" AT TIME ZONE 'UTC' AT TIME ZONE ${TZ_SQL}))::int AS hour,
               SUM(t."delayMinutes")::float8 AS total, COUNT(*)::bigint AS trips
        FROM trips t JOIN routes r ON r.id = t."routeId"
        WHERE t."serviceDate" BETWEEN ${range.fromDate} AND ${range.toDate} AND t.status = 'COMPLETED'
          AND (${routeId ?? null}::text IS NULL OR t."routeId" = ${routeId ?? null})
          AND (${scope.all} OR r."depotId" = ANY(${scope.depotIds}))
        GROUP BY 1, 2, 3`),
    ]);

    const avgOf = new Map(byHour.map((h) => [h.hour, round1(h.avg)]));
    return {
      avgDelayByHour: Array.from({ length: 24 }, (_, hour) => ({ hour, avgDelayMin: avgOf.get(hour) ?? 0 })),
      worstRoutes: worstRoutes(byRoute.map((r) => ({ ...r, trips: Number(r.trips) }))),
    };
  }

  /** GET /analytics/demand: load factor per departure band of one route, with LOW, MEDIUM or HIGH. */
  async demand(user: AuthenticatedUser, routeId: string, from: string, to: string): Promise<DemandBandDto[]> {
    const range = this.range(from, to);
    await this.assertRoute(await this.scopeFor(user), routeId);
    const rows = await this.prisma.$queryRaw<Array<{ hour: number; seats: bigint; tickets: bigint }>>(Prisma.sql`
      SELECT EXTRACT(HOUR FROM (t."scheduledDepartureAt" AT TIME ZONE 'UTC' AT TIME ZONE ${TZ_SQL}))::int AS hour,
             SUM(bt."totalSeats")::bigint AS seats,
             SUM((SELECT COUNT(*) FROM tickets k WHERE k."tripId" = t.id AND k.status NOT IN ('CANCELLED', 'REFUNDED')))::bigint AS tickets
      FROM trips t JOIN bus_types bt ON bt.id = t."busTypeId"
      WHERE t."routeId" = ${routeId} AND t.status <> 'CANCELLED'
        AND t."serviceDate" BETWEEN ${range.fromDate} AND ${range.toDate}
      GROUP BY 1`);
    return demandBands(rows.map((r) => ({ hour: r.hour, seats: Number(r.seats), tickets: Number(r.tickets) })));
  }

  /** Validated range: real dates, from not after to, at most MAX_RANGE_DAYS long. */
  range(from: string, to: string): Range {
    const fromDate = serviceDateOf(from);
    const toDate = serviceDateOf(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
      throw new AppError("VALIDATION_FAILED", "from must be a date on or before to");
    }
    const days = Math.round((toDate.getTime() - fromDate.getTime()) / DAY_MS) + 1;
    if (days > MAX_RANGE_DAYS) throw new AppError("VALIDATION_FAILED", `A range can cover at most ${MAX_RANGE_DAYS} days`);
    const start = localTimeToUtc(from, "00:00");
    const end = new Date(Math.min(localTimeToUtc(to, "00:00").getTime() + DAY_MS, Date.now()));
    return { from, to, fromDate, toDate, start, end: end < start ? start : end, days };
  }

  /** daily_stats rows for the range: stored rows for past days, live rows for today. */
  async statsRows(range: Range): Promise<DailyStatsRow[]> {
    const today = formatIstDate(new Date());
    const stored = await this.prisma.dailyStats.findMany({
      where: { date: { gte: range.fromDate, lte: range.toDate, lt: serviceDateOf(today) } },
    });
    const rows: DailyStatsRow[] = stored.map((s) => ({ ...s }));
    if (range.from <= today && today <= range.to) rows.push(...(await this.rollups.rowsForDate(today)));
    return rows;
  }

  private async seatsByRoute(range: Range, routeIds: string[]): Promise<Map<string, number>> {
    if (!routeIds.length) return new Map();
    const rows = await this.prisma.$queryRaw<Array<{ routeId: string; seats: bigint }>>(Prisma.sql`
      SELECT t."routeId" AS "routeId", SUM(bt."totalSeats")::bigint AS seats
      FROM trips t JOIN bus_types bt ON bt.id = t."busTypeId"
      WHERE t."serviceDate" BETWEEN ${range.fromDate} AND ${range.toDate}
        AND t.status <> 'CANCELLED' AND t."routeId" = ANY(${routeIds})
      GROUP BY 1`);
    return new Map(rows.map((r) => [r.routeId, Number(r.seats)]));
  }

  private async narrowToDistrict(scope: AnalyticsScope, districtId?: string): Promise<string[]> {
    if (!districtId) return scope.depotIds;
    const inDistrict = await this.prisma.depot.findMany({
      where: { districtId, id: { in: scope.depotIds } },
      select: { id: true },
    });
    if (!inDistrict.length) throw new AppError("FORBIDDEN", "District is outside your scope");
    return inDistrict.map((d) => d.id);
  }

  private async assertRoute(scope: AnalyticsScope, routeId: string): Promise<void> {
    const route = await this.prisma.route.findUnique({ where: { id: routeId }, select: { depotId: true } });
    if (!route) throw new AppError("NOT_FOUND", "Route not found");
    if (!scope.depotIds.includes(route.depotId)) throw new AppError("FORBIDDEN", "Route is outside your scope");
  }
}

/**
 * The five routes with the highest average delay, each with the 3 hour window of departures that
 * had the highest average delay (plan sec 39: "average delay 18 min, mostly 5 PM to 8 PM").
 */
export function worstRoutes(rows: ReadonlyArray<{ routeId: string; routeCode: string; hour: number; total: number; trips: number }>): DelayAnalyticsDto["worstRoutes"] {
  const byRoute = new Map<string, { code: string; hours: Map<number, { total: number; trips: number }> }>();
  for (const r of rows) {
    const route = byRoute.get(r.routeId) ?? { code: r.routeCode, hours: new Map() };
    route.hours.set(r.hour, { total: r.total, trips: r.trips });
    byRoute.set(r.routeId, route);
  }
  return [...byRoute.entries()]
    .map(([routeId, { code, hours }]) => {
      let total = 0;
      let trips = 0;
      for (const h of hours.values()) {
        total += h.total;
        trips += h.trips;
      }
      // Peak: the hour with the highest average delay, widened to neighbouring hours that reach at
      // least 75 percent of it, at most 3 hours wide (ties go to the earlier hour)
      const avgAt = (h: number) => {
        const cell = hours.get(h);
        return cell && cell.trips ? cell.total / cell.trips : null;
      };
      let best: { from: number; to: number } | null = null;
      let peak = -1;
      for (const h of [...hours.keys()].sort((a, b) => a - b)) {
        const v = avgAt(h)!;
        if (v > peak) {
          peak = v;
          best = { from: h, to: h + 1 };
        }
      }
      while (best && peak > 0 && best.to - best.from < 3) {
        const left = avgAt(best.from - 1);
        const right = avgAt(best.to);
        const okLeft = left !== null && left >= peak * 0.75;
        const okRight = right !== null && right >= peak * 0.75;
        if (!okLeft && !okRight) break;
        if (okRight && (!okLeft || right! >= left!)) best.to += 1;
        else best.from -= 1;
      }
      const avg = trips ? total / trips : 0;
      return {
        routeId,
        routeCode: code,
        avgDelayMin: round1(avg),
        peakFromHour: best && avg > 0 ? best.from : null,
        peakToHour: best && avg > 0 ? best.to : null,
      };
    })
    .sort((a, b) => b.avgDelayMin - a.avgDelayMin || a.routeCode.localeCompare(b.routeCode))
    .slice(0, 5);
}

/** Load factor and level per band from per-hour seats and tickets (plan sec 38). */
export function demandBands(rows: ReadonlyArray<{ hour: number; seats: number; tickets: number }>): DemandBandDto[] {
  const totals = { MORNING: { s: 0, t: 0 }, AFTERNOON: { s: 0, t: 0 }, EVENING: { s: 0, t: 0 }, NIGHT: { s: 0, t: 0 } };
  for (const r of rows) {
    const band = totals[demandBandOfHour(r.hour)];
    band.s += r.seats;
    band.t += r.tickets;
  }
  return (["MORNING", "AFTERNOON", "EVENING", "NIGHT"] as const).map((band) => {
    const loadFactorPct = calculateLoadFactor(totals[band].t, totals[band].s);
    return { band, loadFactorPct, level: demandLevelOf(loadFactorPct) };
  });
}
