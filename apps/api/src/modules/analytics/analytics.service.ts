import {
  type BusAnalyticsDto,
  type DelayAnalyticsDto,
  type DemandBandDto,
  type PassengerAnalyticsDto,
  type RouteAnalyticsDto,
} from "@aptransit/shared";
import { Injectable } from "@nestjs/common";
import type { AuthenticatedUser } from "../../common/auth/auth.types";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /analytics/routes: per route aggregates from daily_stats and trips.
   */
  async routes(
    user: AuthenticatedUser,
    from: string,
    to: string,
    districtId?: string,
  ): Promise<RouteAnalyticsDto[]> {
    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const toDate = new Date(`${to}T23:59:59.999Z`);

    const routes = await this.prisma.route.findMany({
      where: districtId ? { depot: { districtId } } : undefined,
      select: {
        id: true,
        code: true,
        nameEn: true,
        nameTe: true,
      },
    });

    const routeIds = routes.map((r) => r.id);

    // Fetch from daily_stats
    const stats = await this.prisma.dailyStats.findMany({
      where: {
        routeId: { in: routeIds },
        date: { gte: fromDate, lte: toDate },
      },
    });

    const statsMap = new Map<string, {
      passengers: number;
      trips: number;
      cancellations: number;
      revenuePaise: bigint;
      totalDelays: number;
      completedCount: number;
      totalSeats: number;
    }>();

    for (const r of routes) {
      statsMap.set(r.id, {
        passengers: 0,
        trips: 0,
        cancellations: 0,
        revenuePaise: 0n,
        totalDelays: 0,
        completedCount: 0,
        totalSeats: 0,
      });
    }

    for (const s of stats) {
      if (!s.routeId || !statsMap.has(s.routeId)) continue;
      const agg = statsMap.get(s.routeId)!;
      agg.passengers += s.passengers;
      agg.trips += s.tripsScheduled;
      agg.cancellations += s.tripsCancelled;
      agg.revenuePaise += s.revenuePaise;
      agg.totalDelays += s.avgDelayMin * s.tripsCompleted;
      agg.completedCount += s.tripsCompleted;
      agg.totalSeats += s.tripsScheduled * 40;
    }

    return routes.map((r) => {
      const agg = statsMap.get(r.id)!;
      const avgDelayMin =
        agg.completedCount > 0
          ? Math.round((agg.totalDelays / agg.completedCount) * 10) / 10
          : 0;

      const loadFactorPct =
        agg.totalSeats > 0
          ? Math.min(100, Math.round((agg.passengers / agg.totalSeats) * 1000) / 10)
          : 0;

      return {
        routeId: r.id,
        routeCode: r.code,
        routeNameEn: r.nameEn,
        routeNameTe: r.nameTe,
        passengers: agg.passengers,
        trips: agg.trips,
        loadFactorPct,
        avgDelayMin,
        cancellations: agg.cancellations,
        revenuePaise: Number(agg.revenuePaise),
      };
    });
  }

  /**
   * GET /analytics/buses: per bus utilisation and trips.
   */
  async buses(
    user: AuthenticatedUser,
    from: string,
    to: string,
    depotId?: string,
  ): Promise<BusAnalyticsDto[]> {
    const buses = await this.prisma.bus.findMany({
      where: depotId ? { depotId } : undefined,
      include: {
        busType: true,
        tripAssignments: {
          where: {
            trip: {
              serviceDate: { gte: from, lte: to },
            },
          },
          include: {
            trip: {
              include: {
                route: true,
              },
            },
          },
        },
      },
    });

    return buses.map((b) => {
      let tripsCount = 0;
      let totalKm = 0;
      let totalDurationMin = 0;

      for (const a of b.tripAssignments) {
        if (a.trip.status === "COMPLETED") {
          tripsCount++;
          totalKm += a.trip.route.distanceKm || 0;
          totalDurationMin += Math.round((a.trip.route.distanceKm || 60) * 2);
        }
      }

      // Utilisation = active running hours out of 16 operating hours a day over period
      const fromDate = new Date(`${from}T00:00:00.000Z`);
      const toDate = new Date(`${to}T00:00:00.000Z`);
      const daysCount = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000)) + 1);
      const possibleHours = daysCount * 16;
      const actualHours = totalDurationMin / 60;
      const utilisationPct = Math.min(100, Math.round((actualHours / possibleHours) * 1000) / 10);

      // Downtime hours (if bus is maintenance or breakdown)
      const downtimeHours = b.status === "MAINTENANCE" || b.status === "BREAKDOWN" ? 24 : 0;

      return {
        busId: b.id,
        registrationNumber: b.regNo,
        busType: b.busType.nameEn,
        depotId: b.depotId,
        trips: tripsCount,
        km: Math.round(totalKm * 10) / 10,
        utilisationPct,
        downtimeHours,
      };
    });
  }

  /**
   * GET /analytics/passengers: ticket counts, pass usage, busy hours array of 24.
   */
  async passengers(
    user: AuthenticatedUser,
    from: string,
    to: string,
  ): Promise<PassengerAnalyticsDto> {
    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const toDate = new Date(`${to}T23:59:59.999Z`);

    const [ticketsSold, passUsage, trips] = await Promise.all([
      this.prisma.ticket.count({
        where: {
          trip: { serviceDate: { gte: fromDate, lte: toDate } },
          status: { notIn: ["CANCELLED", "REFUNDED"] },
        },
      }),
      this.prisma.ticketScan.count({
        where: {
          passId: { not: null },
          scannedAt: {
            gte: fromDate,
            lte: toDate,
          },
        },
      }),
      this.prisma.trip.findMany({
        where: { serviceDate: { gte: fromDate, lte: toDate } },
        include: {
          route: true,
          tickets: {
            where: { status: { notIn: ["CANCELLED", "REFUNDED"] } },
          },
        },
      }),
    ]);

    const busyHours = new Array(24).fill(0);
    const routePassengerMap = new Map<string, { code: string; count: number }>();

    for (const t of trips) {
      const hour = t.scheduledDepartureAt.getUTCHours();
      const count = t.tickets.length;
      busyHours[hour] = (busyHours[hour] || 0) + count;

      if (!routePassengerMap.has(t.routeId)) {
        routePassengerMap.set(t.routeId, { code: t.route.code, count: 0 });
      }
      routePassengerMap.get(t.routeId)!.count += count;
    }

    const topRoutes = Array.from(routePassengerMap.entries())
      .map(([routeId, data]) => ({
        routeId,
        routeCode: data.code,
        passengers: data.count,
      }))
      .sort((a, b) => b.passengers - a.passengers)
      .slice(0, 5);

    return {
      ticketsSold,
      passUsage,
      busyHours,
      topRoutes,
    };
  }

  /**
   * GET /analytics/delays: avg delay by hour of day and worst routes.
   */
  async delays(
    user: AuthenticatedUser,
    from: string,
    to: string,
    routeId?: string,
  ): Promise<DelayAnalyticsDto> {
    const trips = await this.prisma.trip.findMany({
      where: {
        serviceDate: { gte: from, lte: to },
        routeId: routeId || undefined,
        status: { in: ["COMPLETED", "RUNNING"] },
      },
      include: {
        route: true,
      },
    });

    const hourDelaySums = new Array(24).fill(0);
    const hourTripCounts = new Array(24).fill(0);
    const routeDelayMap = new Map<string, { code: string; sumDelay: number; count: number }>();

    for (const t of trips) {
      const hour = t.scheduledDepartureAt.getUTCHours();
      hourDelaySums[hour] += t.delayMinutes;
      hourTripCounts[hour] += 1;

      if (!routeDelayMap.has(t.routeId)) {
        routeDelayMap.set(t.routeId, { code: t.route.code, sumDelay: 0, count: 0 });
      }
      const rd = routeDelayMap.get(t.routeId)!;
      rd.sumDelay += t.delayMinutes;
      rd.count += 1;
    }

    const avgDelayByHour = Array.from({ length: 24 }, (_, hour) => {
      const count = hourTripCounts[hour] || 0;
      const sum = hourDelaySums[hour] || 0;
      return {
        hour,
        avgDelayMin: count > 0 ? Math.round((sum / count) * 10) / 10 : 0,
      };
    });

    const worstRoutes = Array.from(routeDelayMap.entries())
      .map(([rId, data]) => ({
        routeId: rId,
        routeCode: data.code,
        avgDelayMin: data.count > 0 ? Math.round((data.sumDelay / data.count) * 10) / 10 : 0,
      }))
      .sort((a, b) => b.avgDelayMin - a.avgDelayMin)
      .slice(0, 5);

    return {
      avgDelayByHour,
      worstRoutes,
    };
  }

  /**
   * GET /analytics/demand: bands MORNING, AFTERNOON, EVENING, NIGHT with level LOW, MEDIUM, HIGH.
   * Fixed thresholds per prompt: under 50% LOW, 50 to 80% MEDIUM, over 80% HIGH.
   */
  async demand(
    user: AuthenticatedUser,
    routeId: string,
    from: string,
    to: string,
  ): Promise<DemandBandDto[]> {
    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const toDate = new Date(`${to}T23:59:59.999Z`);

    const trips = await this.prisma.trip.findMany({
      where: {
        routeId,
        serviceDate: { gte: fromDate, lte: toDate },
        status: { in: ["COMPLETED", "RUNNING"] },
      },
      include: {
        busType: true,
        tickets: {
          where: { status: { notIn: ["CANCELLED", "REFUNDED"] } },
        },
      },
    });

    // Time bands:
    // MORNING: 05:00 to 11:59
    // AFTERNOON: 12:00 to 16:59
    // EVENING: 17:00 to 20:59
    // NIGHT: 21:00 to 04:59
    const bandStats = {
      MORNING: { passengers: 0, seats: 0 },
      AFTERNOON: { passengers: 0, seats: 0 },
      EVENING: { passengers: 0, seats: 0 },
      NIGHT: { passengers: 0, seats: 0 },
    };

    for (const t of trips) {
      const hour = t.scheduledDepartureAt.getUTCHours();
      let band: "MORNING" | "AFTERNOON" | "EVENING" | "NIGHT";
      if (hour >= 5 && hour < 12) {
        band = "MORNING";
      } else if (hour >= 12 && hour < 17) {
        band = "AFTERNOON";
      } else if (hour >= 17 && hour < 21) {
        band = "EVENING";
      } else {
        band = "NIGHT";
      }

      const passengers = (t.tickets as Array<{ passengerCount?: number }>).reduce(
        (sum: number, ticket) => sum + (ticket.passengerCount ?? 1),
        0,
      );
      const seats = t.busType?.totalSeats || 40;

      bandStats[band].passengers += passengers;
      bandStats[band].seats += seats;
    }

    const bands: Array<"MORNING" | "AFTERNOON" | "EVENING" | "NIGHT"> = [
      "MORNING",
      "AFTERNOON",
      "EVENING",
      "NIGHT",
    ];

    return bands.map((band) => {
      const { passengers, seats } = bandStats[band];
      const loadFactorPct =
        seats > 0 ? Math.min(100, Math.round((passengers / seats) * 1000) / 10) : 0;

      let level: "LOW" | "MEDIUM" | "HIGH";
      if (loadFactorPct < 50) {
        level = "LOW";
      } else if (loadFactorPct <= 80) {
        level = "MEDIUM";
      } else {
        level = "HIGH";
      }

      return {
        band,
        loadFactorPct,
        level,
      };
    });
  }
}
