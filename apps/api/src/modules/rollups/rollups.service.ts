import { DELAY_DISPLAY_THRESHOLD_MIN, formatIstDate, localTimeToUtc } from "@aptransit/shared";
import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * On-time percentage: completed trips with a delay under 5 minutes over completed trips.
 * 100 when nothing completed (nothing was late).
 */
export function calculateOnTimePct(completedTrips: Array<{ delayMinutes: number }>): number {
  if (completedTrips.length === 0) return 100;
  const onTimeCount = completedTrips.filter((t) => t.delayMinutes < DELAY_DISPLAY_THRESHOLD_MIN).length;
  const pct = (onTimeCount / completedTrips.length) * 100;
  return Math.round(pct * 10) / 10;
}

/** Load factor percentage: tickets over seats offered, one decimal, 0 to 100. */
export function calculateLoadFactor(ticketsSold: number, totalSeats: number): number {
  if (totalSeats <= 0) return 0;
  const pct = (ticketsSold / totalSeats) * 100;
  return Math.min(100, Math.max(0, Math.round(pct * 10) / 10));
}

/** Revenue: captured minus refunded, never below zero. */
export function calculateRevenue(
  capturedPaise: bigint | number,
  refundedPaise: bigint | number,
): bigint {
  const diff = BigInt(capturedPaise) - BigInt(refundedPaise);
  return diff < 0n ? 0n : diff;
}

/** The facts of one trip that the rollup needs, read from the database by `computeRollupsForDate`. */
export interface TripFact {
  routeId: string;
  routeCode: string;
  depotId: string;
  districtId: string;
  stateId: string;
  status: string;
  delayMinutes: number;
  /** Tickets on the trip that were not cancelled or refunded (single and free travel). */
  tickets: number;
  /** Valid pass scans on the trip: pass holders travel without a ticket. */
  passScans: number;
  capturedPaise: bigint;
  refundedPaise: bigint;
  incidents: number;
}

export interface DayExtras {
  /** Complaints created that day with their depot (when known) and route code (when given). */
  complaints: Array<{ depotId: string | null; routeCode: string | null }>;
  /** depotId to districtId, so complaints of a depot without trips that day still count. */
  depotDistrict: ReadonlyMap<string, string>;
  /** districtId to stateId (D-034). */
  districtState: ReadonlyMap<string, string>;
  /** Every active state: each gets a state row, even on a day without trips. */
  stateIds: readonly string[];
  /**
   * Passes valid for at least part of the day, per state of the pass type. State rows only: a pass
   * is not tied to a place. Key null is a pass type sold in every state; it counts in every state.
   */
  passesActive: ReadonlyMap<string | null, number>;
}

export interface DailyStatsRow {
  date: Date;
  stateId: string | null;
  routeId: string | null;
  depotId: string | null;
  districtId: string | null;
  tripsScheduled: number;
  tripsCompleted: number;
  tripsCancelled: number;
  avgDelayMin: number;
  onTimePct: number;
  passengers: number;
  ticketsSold: number;
  passesActive: number;
  revenuePaise: bigint;
  incidents: number;
  complaints: number;
}

type Totals = Omit<DailyStatsRow, "date" | "stateId" | "routeId" | "depotId" | "districtId" | "passesActive" | "complaints">;

function totals(trips: readonly TripFact[]): Totals {
  const completed = trips.filter((t) => t.status === "COMPLETED");
  const delaySum = completed.reduce((sum, t) => sum + t.delayMinutes, 0);
  let tickets = 0;
  let passScans = 0;
  let captured = 0n;
  let refunded = 0n;
  let incidents = 0;
  for (const t of trips) {
    tickets += t.tickets;
    passScans += t.passScans;
    captured += t.capturedPaise;
    refunded += t.refundedPaise;
    incidents += t.incidents;
  }
  return {
    tripsScheduled: trips.length,
    tripsCompleted: completed.length,
    tripsCancelled: trips.filter((t) => t.status === "CANCELLED").length,
    avgDelayMin: completed.length ? Math.round((delaySum / completed.length) * 10) / 10 : 0,
    onTimePct: calculateOnTimePct(completed),
    passengers: tickets + passScans,
    ticketsSold: tickets,
    revenuePaise: calculateRevenue(captured, refunded),
    incidents,
  };
}

function groupBy<K>(trips: readonly TripFact[], key: (t: TripFact) => K): Map<K, TripFact[]> {
  const out = new Map<K, TripFact[]>();
  for (const t of trips) {
    const k = key(t);
    const list = out.get(k);
    if (list) list.push(t);
    else out.set(k, [t]);
  }
  return out;
}

/**
 * Builds the daily_stats rows for one IST date. Every row has its stateId (D-034). Levels are told
 * apart by which other ids are set: route rows have routeId (plus their depot and district), depot
 * rows have depotId and districtId, district rows only districtId, and each state row has none.
 * Complaints without a depot have no place, so they count in every state row (like null state passes).
 */
export function buildDailyStats(date: Date, trips: readonly TripFact[], extras: DayExtras): DailyStatsRow[] {
  const complaintsByRoute = new Map<string, number>();
  const complaintsByDepot = new Map<string, number>();
  const complaintsByDistrict = new Map<string, number>();
  const complaintsByState = new Map<string, number>();
  let placeless = 0;
  for (const c of extras.complaints) {
    if (!c.depotId) placeless++;
    if (c.routeCode) complaintsByRoute.set(c.routeCode, (complaintsByRoute.get(c.routeCode) ?? 0) + 1);
    if (c.depotId) {
      complaintsByDepot.set(c.depotId, (complaintsByDepot.get(c.depotId) ?? 0) + 1);
      const districtId = extras.depotDistrict.get(c.depotId);
      if (districtId) complaintsByDistrict.set(districtId, (complaintsByDistrict.get(districtId) ?? 0) + 1);
      const stateId = districtId ? extras.districtState.get(districtId) : undefined;
      if (stateId) complaintsByState.set(stateId, (complaintsByState.get(stateId) ?? 0) + 1);
    }
  }
  const stateOf = (districtId: string | null) => (districtId ? (extras.districtState.get(districtId) ?? null) : null);

  const rows: DailyStatsRow[] = [];
  for (const [routeId, group] of groupBy(trips, (t) => t.routeId)) {
    const first = group[0]!;
    rows.push({
      date,
      stateId: first.stateId,
      routeId,
      depotId: first.depotId,
      districtId: first.districtId,
      ...totals(group),
      passesActive: 0,
      complaints: complaintsByRoute.get(first.routeCode) ?? 0,
    });
  }

  const depots = groupBy(trips, (t) => t.depotId);
  for (const depotId of complaintsByDepot.keys()) if (!depots.has(depotId)) depots.set(depotId, []);
  for (const [depotId, group] of depots) {
    const districtId = group[0]?.districtId ?? extras.depotDistrict.get(depotId) ?? null;
    rows.push({
      date,
      stateId: group[0]?.stateId ?? stateOf(districtId),
      routeId: null,
      depotId,
      districtId,
      ...totals(group),
      passesActive: 0,
      complaints: complaintsByDepot.get(depotId) ?? 0,
    });
  }

  const districts = groupBy(trips, (t) => t.districtId);
  for (const districtId of complaintsByDistrict.keys()) if (!districts.has(districtId)) districts.set(districtId, []);
  for (const [districtId, group] of districts) {
    rows.push({
      date,
      stateId: group[0]?.stateId ?? stateOf(districtId),
      routeId: null,
      depotId: null,
      districtId,
      ...totals(group),
      passesActive: 0,
      complaints: complaintsByDistrict.get(districtId) ?? 0,
    });
  }

  const states = groupBy(trips, (t) => t.stateId);
  for (const stateId of extras.stateIds) if (!states.has(stateId)) states.set(stateId, []);
  for (const [stateId, group] of states) {
    rows.push({
      date,
      stateId,
      routeId: null,
      depotId: null,
      districtId: null,
      ...totals(group),
      passesActive: (extras.passesActive.get(stateId) ?? 0) + (extras.passesActive.get(null) ?? 0),
      complaints: (complaintsByState.get(stateId) ?? 0) + placeless,
    });
  }
  return rows;
}

/** The service date column holds midnight UTC of the IST calendar date (trip-generator.ts). */
export function serviceDateOf(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

@Injectable()
export class RollupsService {
  private readonly logger = new Logger(RollupsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Computes daily_stats for one IST date (YYYY-MM-DD). Replaces that date's rows, so reruns are safe. */
  async computeRollupsForDate(dateStr: string): Promise<number> {
    const date = serviceDateOf(dateStr);
    const rows = await this.rowsForDate(dateStr);
    await this.prisma.$transaction([
      this.prisma.dailyStats.deleteMany({ where: { date } }),
      this.prisma.dailyStats.createMany({ data: rows }),
    ]);
    this.logger.log(`Created ${rows.length} daily_stats rows for ${dateStr}`);
    return rows.length;
  }

  /**
   * The daily_stats rows for one IST date, computed from the records without saving them.
   * Analytics uses this for today, so live numbers follow exactly the same rules as the rollup.
   */
  async rowsForDate(dateStr: string): Promise<DailyStatsRow[]> {
    const date = serviceDateOf(dateStr);
    const dayStart = localTimeToUtc(dateStr, "00:00");
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);

    const trips = await this.prisma.trip.findMany({
      where: { serviceDate: date },
      select: {
        id: true,
        routeId: true,
        status: true,
        delayMinutes: true,
        route: { select: { code: true, depotId: true, depot: { select: { districtId: true } } } },
      },
    });
    const ids = trips.map((t) => t.id);

    const [tickets, passScans, incidents, money, refunds, complaints, depots, districts, states, passesActive] = await Promise.all([
      this.prisma.ticket.groupBy({
        by: ["tripId"],
        where: { tripId: { in: ids }, status: { notIn: ["CANCELLED", "REFUNDED"] } },
        _count: { _all: true },
      }),
      this.prisma.ticketScan.groupBy({
        by: ["tripId"],
        where: { tripId: { in: ids }, passId: { not: null }, result: "VALID" },
        _count: { _all: true },
      }),
      this.prisma.incident.groupBy({ by: ["tripId"], where: { tripId: { in: ids } }, _count: { _all: true } }),
      ids.length
        ? this.prisma.$queryRaw<Array<{ tripId: string; paise: bigint }>>(Prisma.sql`
            SELECT b."tripId" AS "tripId", COALESCE(SUM(p."amountPaise"), 0)::bigint AS paise
            FROM payments p JOIN bookings b ON b.id = p."bookingId"
            WHERE p."capturedAt" IS NOT NULL AND b."tripId" = ANY(${ids})
            GROUP BY b."tripId"`)
        : Promise.resolve([]),
      ids.length
        ? this.prisma.$queryRaw<Array<{ tripId: string; paise: bigint }>>(Prisma.sql`
            SELECT b."tripId" AS "tripId", COALESCE(SUM(r."amountPaise"), 0)::bigint AS paise
            FROM refunds r JOIN payments p ON p.id = r."paymentId" JOIN bookings b ON b.id = p."bookingId"
            WHERE r.status = 'PROCESSED' AND b."tripId" = ANY(${ids})
            GROUP BY b."tripId"`)
        : Promise.resolve([]),
      this.prisma.complaint.findMany({
        where: { createdAt: { gte: dayStart, lt: dayEnd } },
        select: { depotId: true, routeCode: true },
      }),
      this.prisma.depot.findMany({ select: { id: true, districtId: true } }),
      this.prisma.district.findMany({ select: { id: true, stateId: true } }),
      this.prisma.state.findMany({ where: { isActive: true }, select: { id: true } }),
      this.prisma.passType.findMany({
        select: {
          stateId: true,
          _count: {
            select: {
              passes: {
                where: { status: { in: ["ACTIVE", "EXPIRED"] }, validFrom: { lt: dayEnd }, validUntil: { gte: dayStart } },
              },
            },
          },
        },
      }),
    ]);
    const districtState = new Map(districts.map((d) => [d.id, d.stateId]));

    const count = (rows: Array<{ tripId: string; _count: { _all: number } }>) =>
      new Map(rows.map((r) => [r.tripId, r._count._all]));
    const ticketMap = count(tickets);
    const scanMap = count(passScans);
    const incidentMap = count(incidents);
    const capturedMap = new Map(money.map((r) => [r.tripId, BigInt(r.paise)]));
    const refundedMap = new Map(refunds.map((r) => [r.tripId, BigInt(r.paise)]));

    const facts: TripFact[] = trips.map((t) => ({
      routeId: t.routeId,
      routeCode: t.route.code,
      depotId: t.route.depotId,
      districtId: t.route.depot.districtId,
      stateId: districtState.get(t.route.depot.districtId) ?? "",
      status: t.status,
      delayMinutes: t.delayMinutes,
      tickets: ticketMap.get(t.id) ?? 0,
      passScans: scanMap.get(t.id) ?? 0,
      capturedPaise: capturedMap.get(t.id) ?? 0n,
      refundedPaise: refundedMap.get(t.id) ?? 0n,
      incidents: incidentMap.get(t.id) ?? 0,
    }));

    return buildDailyStats(date, facts, {
      complaints,
      depotDistrict: new Map(depots.map((d) => [d.id, d.districtId])),
      districtState,
      stateIds: states.map((s) => s.id),
      passesActive: passesActive.reduce(
        (m, t) => m.set(t.stateId, (m.get(t.stateId) ?? 0) + t._count.passes),
        new Map<string | null, number>(),
      ),
    });
  }

  /** Recomputes the last `days` IST dates, ending yesterday. */
  async backfill(days = 14, now = new Date()): Promise<number> {
    let total = 0;
    for (let i = days; i >= 1; i--) {
      total += await this.computeRollupsForDate(formatIstDate(new Date(now.getTime() - i * DAY_MS)));
    }
    return total;
  }
}
