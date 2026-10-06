import { formatIstDate } from "@aptransit/shared";
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * On-time percentage calculation:
 * Trips with delay under 5 minutes divided by completed trips.
 * Defaults to 100% when there are no completed trips.
 */
export function calculateOnTimePct(completedTrips: Array<{ delayMinutes: number }>): number {
  if (completedTrips.length === 0) return 100;
  const onTimeCount = completedTrips.filter((t) => t.delayMinutes < 5).length;
  const pct = (onTimeCount / completedTrips.length) * 100;
  return Math.round(pct * 10) / 10;
}

/**
 * Load factor percentage calculation:
 * Tickets sold divided by total seats available.
 */
export function calculateLoadFactor(ticketsSold: number, totalSeats: number): number {
  if (totalSeats <= 0) return 0;
  const pct = (ticketsSold / totalSeats) * 100;
  return Math.min(100, Math.max(0, Math.round(pct * 10) / 10));
}

/**
 * Revenue calculation:
 * Captured amount minus refunded amount.
 */
export function calculateRevenue(
  capturedPaise: bigint | number,
  refundedPaise: bigint | number,
): bigint {
  const diff = BigInt(capturedPaise) - BigInt(refundedPaise);
  return diff < 0n ? 0n : diff;
}

@Injectable()
export class RollupsService {
  private readonly logger = new Logger(RollupsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Computes daily_stats for a given IST date (YYYY-MM-DD).
   * Generates rollups per route, per depot, and per district.
   */
  async computeRollupsForDate(dateStr: string): Promise<number> {
    const dateObj = new Date(`${dateStr}T00:00:00.000Z`);
    this.logger.log(`Computing daily rollups for ${dateStr}...`);

    // Fetch all trips for this service date
    const trips = await this.prisma.trip.findMany({
      where: { serviceDate: dateObj },
      include: {
        busType: true,
        route: {
          include: {
            depot: true,
          },
        },
        tickets: {
          where: {
            status: { notIn: ["CANCELLED", "REFUNDED"] },
          },
          include: {
            booking: true,
          },
        },
        incidents: true,
      },
    });

    if (trips.length === 0) {
      this.logger.log(`No trips found for ${dateStr}, skipping.`);
      return 0;
    }

    // Clean up existing stats for this date to keep it idempotent
    await this.prisma.dailyStats.deleteMany({
      where: { date: dateObj },
    });

    const routeGroups = new Map<string, typeof trips>();
    const depotGroups = new Map<string, typeof trips>();
    const districtGroups = new Map<string, typeof trips>();

    for (const trip of trips) {
      // By route
      const rId = trip.routeId;
      if (!routeGroups.has(rId)) routeGroups.set(rId, []);
      routeGroups.get(rId)!.push(trip);

      // By depot
      const dId = trip.route.depotId;
      if (!depotGroups.has(dId)) depotGroups.set(dId, []);
      depotGroups.get(dId)!.push(trip);

      // By district
      const distId = trip.route.depot.districtId;
      if (!districtGroups.has(distId)) districtGroups.set(distId, []);
      districtGroups.get(distId)!.push(trip);
    }

    const statsToCreate: Array<{
      date: Date;
      routeId?: string;
      depotId?: string;
      districtId?: string;
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
    }> = [];

    // Helper to calculate aggregate metrics for a collection of trips
    const aggregate = (groupTrips: typeof trips) => {
      const tripsScheduled = groupTrips.length;
      const completed = groupTrips.filter((t) => t.status === "COMPLETED");
      const cancelled = groupTrips.filter((t) => t.status === "CANCELLED");

      const avgDelayMin =
        completed.length > 0
          ? Math.round((completed.reduce((acc, t) => acc + t.delayMinutes, 0) / completed.length) * 10) / 10
          : 0;

      const onTimePct = calculateOnTimePct(completed);

      let ticketsSold = 0;
      let passengers = 0;
      let capturedPaise = 0n;
      let incidentsCount = 0;

      for (const t of groupTrips) {
        ticketsSold += t.tickets.length;
        passengers += t.tickets.length;
        capturedPaise += t.tickets.reduce((sum: bigint, tk) => sum + BigInt(tk.farePaise), 0n);
        incidentsCount += t.incidents.length;
      }

      return {
        tripsScheduled,
        tripsCompleted: completed.length,
        tripsCancelled: cancelled.length,
        avgDelayMin,
        onTimePct,
        passengers,
        ticketsSold,
        passesActive: 0,
        revenuePaise: capturedPaise,
        incidents: incidentsCount,
        complaints: 0,
      };
    };

    // 1. Per Route
    for (const [routeId, rTrips] of routeGroups) {
      const agg = aggregate(rTrips);
      const depotId = rTrips[0]?.route.depotId;
      const districtId = rTrips[0]?.route.depot.districtId;
      statsToCreate.push({
        date: dateObj,
        routeId,
        depotId,
        districtId,
        ...agg,
      });
    }

    // 2. Per Depot
    for (const [depotId, dTrips] of depotGroups) {
      const agg = aggregate(dTrips);
      const districtId = dTrips[0]?.route.depot.districtId;
      statsToCreate.push({
        date: dateObj,
        depotId,
        districtId,
        ...agg,
      });
    }

    // 3. Per District
    for (const [districtId, distTrips] of districtGroups) {
      const agg = aggregate(distTrips);
      statsToCreate.push({
        date: dateObj,
        districtId,
        ...agg,
      });
    }

    if (statsToCreate.length > 0) {
      await this.prisma.dailyStats.createMany({
        data: statsToCreate,
      });
    }

    this.logger.log(`Created ${statsToCreate.length} daily_stats rows for ${dateStr}.`);
    return statsToCreate.length;
  }

  /**
   * Backfill daily_stats for the past N days up to yesterday.
   */
  async backfill(days = 14): Promise<number> {
    let totalRows = 0;
    const now = new Date();

    for (let i = days; i >= 1; i--) {
      const targetDate = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = formatIstDate(targetDate);
      const created = await this.computeRollupsForDate(dateStr);
      totalRows += created;
    }

    return totalRows;
  }
}
