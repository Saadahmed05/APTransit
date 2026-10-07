import {
  type DisplayStatus,
  formatIstDate,
  type GovDepotSummaryDto,
  type GovDistrictSummaryDto,
  type GovMapDto,
  type GovOverviewDto,
  type GovRouteSummaryDto,
  type IncidentDto,
  type OpsTripDto,
} from "@aptransit/shared";
import { Injectable, NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "../../common/auth/auth.types";
import { ScopeService } from "../../common/services/scope.service";
import { PrismaService } from "../../prisma/prisma.service";
import { TrackingService } from "../tracking/tracking.service";

function toServiceDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

@Injectable()
export class GovService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly tracking: TrackingService,
  ) {}

  /**
   * GET /gov/overview: today live from queries plus Redis live counts.
   */
  async overview(user: AuthenticatedUser, dateStr?: string): Promise<GovOverviewDto> {
    const todayStr = dateStr || formatIstDate(new Date());
    const serviceDate = toServiceDate(todayStr);

    // 1. Active buses and trips today
    const [activeBusesCount, activeTripsCount] = await Promise.all([
      this.prisma.bus.count({ where: { status: "RUNNING" } }),
      this.prisma.trip.count({
        where: { serviceDate, status: "RUNNING" },
      }),
    ]);

    // 2. Delayed trips today (status not CANCELLED, delay > 5)
    const delayedTripsCount = await this.prisma.trip.count({
      where: {
        serviceDate,
        status: { not: "CANCELLED" },
        delayMinutes: { gt: 5 },
      },
    });

    // 3. Open incidents
    const openIncidentsCount = await this.prisma.incident.count({
      where: { status: { in: ["OPEN", "ACKNOWLEDGED"] } },
    });

    // 4. Tickets and passengers today
    const tickets = await this.prisma.ticket.findMany({
      where: {
        trip: { serviceDate },
        status: { notIn: ["CANCELLED", "REFUNDED"] },
      },
      select: {
        farePaise: true,
      },
    });

    const ticketsToday = tickets.length;
    const passengersToday = tickets.length;
    const revenueTodayPaise = tickets.reduce((sum, t) => sum + t.farePaise, 0);

    // 5. On-time percentage
    const completedOrRunning = await this.prisma.trip.findMany({
      where: {
        serviceDate,
        status: { in: ["RUNNING", "COMPLETED"] },
      },
      select: { delayMinutes: true },
    });

    let onTimePct = 100;
    if (completedOrRunning.length > 0) {
      const onTime = completedOrRunning.filter((t) => t.delayMinutes < 5).length;
      onTimePct = Math.round((onTime / completedOrRunning.length) * 1000) / 10;
    }

    return {
      activeBuses: activeBusesCount,
      activeTrips: activeTripsCount,
      passengersToday,
      delayedTrips: delayedTripsCount,
      openIncidents: openIncidentsCount,
      onTimePct,
      ticketsToday,
      revenueTodayPaise,
    };
  }

  /**
   * GET /gov/map: district rollups, live buses and open incidents.
   */
  async map(user: AuthenticatedUser): Promise<GovMapDto> {
    const districts = await this.prisma.district.findMany({
      include: {
        depots: {
          include: {
            buses: { where: { status: "RUNNING" }, select: { id: true } },
            routes: {
              include: {
                trips: {
                  where: {
                    serviceDate: toServiceDate(formatIstDate(new Date())),
                    status: { not: "CANCELLED" },
                    delayMinutes: { gt: 5 },
                  },
                  select: { id: true },
                },
              },
            },
          },
        },
      },
    });

    // Open incidents across state
    const openIncidents = await this.prisma.incident.findMany({
      where: { status: { in: ["OPEN", "ACKNOWLEDGED"] } },
      include: {
        trip: { select: { code: true } },
        bus: { select: { regNo: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const districtItems = districts.map((d) => {
      let activeBuses = 0;
      let delayed = 0;
      for (const depot of d.depots) {
        activeBuses += depot.buses.length;
        for (const route of depot.routes) {
          delayed += route.trips.length;
        }
      }

      // Incidents in this district
      const depotIds = new Set(d.depots.map((dp) => dp.id));
      const incidentsCount = openIncidents.filter((inc) => inc.busId && depotIds.has(inc.busId)).length;

      return {
        id: d.id,
        code: d.code,
        nameEn: d.nameEn,
        nameTe: d.nameTe,
        activeBuses,
        delayed,
        incidents: incidentsCount,
      };
    });

    // Live buses from tracking service
    const liveBuses = await this.tracking.liveBuses(user, undefined, undefined);

    const incidentsDto: IncidentDto[] = openIncidents.map((inc) => ({
      id: inc.id,
      code: inc.code,
      type: inc.type,
      severity: inc.severity,
      status: inc.status,
      tripId: inc.tripId,
      tripCode: inc.trip?.code,
      busId: inc.busId,
      busRegNo: inc.bus?.regNo,
      lat: inc.lat,
      lng: inc.lng,
      note: inc.note,
      createdAt: inc.createdAt.toISOString(),
    }));

    return {
      districts: districtItems,
      buses: liveBuses,
      incidents: incidentsDto,
    };
  }

  /**
   * GET /gov/districts/:id: drill down for district.
   */
  async districtSummary(user: AuthenticatedUser, districtId: string, dateStr?: string): Promise<GovDistrictSummaryDto> {
    this.scope.assertDistrictAccess(user, districtId);

    const district = await this.prisma.district.findUnique({
      where: { id: districtId },
      include: {
        depots: {
          include: {
            buses: true,
            routes: {
              include: {
                trips: {
                  where: { serviceDate: toServiceDate(dateStr || formatIstDate(new Date())) },
                  include: {
                    tickets: {
                      where: { status: { notIn: ["CANCELLED", "REFUNDED"] } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!district) {
      throw new NotFoundException(`District ${districtId} not found`);
    }

    let activeBuses = 0;
    let activeTrips = 0;
    let delayedTrips = 0;
    let passengersToday = 0;
    let revenueTodayPaise = 0;
    let totalCompletedOrRunning = 0;
    let onTimeCount = 0;

    const depotSummaries = district.depots.map((depot) => {
      const activeDepotBuses = depot.buses.filter((b) => b.status === "RUNNING").length;
      let depotActiveTrips = 0;
      let depotDelayedTrips = 0;

      for (const r of depot.routes) {
        for (const t of r.trips) {
          if (t.status === "RUNNING") {
            depotActiveTrips++;
          }
          if (t.status !== "CANCELLED" && t.delayMinutes > 5) {
            depotDelayedTrips++;
          }
          if (t.status === "RUNNING" || t.status === "COMPLETED") {
            totalCompletedOrRunning++;
            if (t.delayMinutes < 5) onTimeCount++;
          }
          for (const tk of t.tickets) {
            passengersToday += 1;
            revenueTodayPaise += tk.farePaise;
          }
        }
      }

      activeBuses += activeDepotBuses;
      activeTrips += depotActiveTrips;
      delayedTrips += depotDelayedTrips;

      return {
        id: depot.id,
        code: depot.code,
        nameEn: depot.nameEn,
        nameTe: depot.nameTe,
        activeBuses: activeDepotBuses,
        activeTrips: depotActiveTrips,
        delayedTrips: depotDelayedTrips,
        totalBuses: depot.buses.length,
      };
    });

    const onTimePct =
      totalCompletedOrRunning > 0
        ? Math.round((onTimeCount / totalCompletedOrRunning) * 1000) / 10
        : 100;

    const openIncidents = await this.prisma.incident.count({
      where: {
        status: { in: ["OPEN", "ACKNOWLEDGED"] },
        trip: { route: { depot: { districtId } } },
      },
    });

    return {
      id: district.id,
      code: district.code,
      nameEn: district.nameEn,
      nameTe: district.nameTe,
      activeBuses,
      activeTrips,
      passengersToday,
      delayedTrips,
      openIncidents,
      onTimePct,
      revenueTodayPaise,
      depots: depotSummaries,
    };
  }

  /**
   * GET /gov/depots/:id: drill down for depot.
   */
  async depotSummary(user: AuthenticatedUser, depotId: string, dateStr?: string): Promise<GovDepotSummaryDto> {
    this.scope.assertDepotAccess(user, depotId);

    const todayStr = dateStr || formatIstDate(new Date());
    const depot = await this.prisma.depot.findUnique({
      where: { id: depotId },
      include: {
        buses: true,
        routes: {
          include: {
            trips: {
              where: { serviceDate: toServiceDate(todayStr) },
              include: {
                busType: true,
                tickets: {
                  where: { status: { notIn: ["CANCELLED", "REFUNDED"] } },
                },
              },
            },
          },
        },
      },
    });

    if (!depot) {
      throw new NotFoundException(`Depot ${depotId} not found`);
    }

    const activeBuses = depot.buses.filter((b) => b.status === "RUNNING").length;
    let activeTrips = 0;
    let delayedTrips = 0;

    const routeSummaries = depot.routes.map((route) => {
      let routeDelayed = 0;
      let totalTickets = 0;
      let totalSeats = 0;

      for (const t of route.trips) {
        if (t.status === "RUNNING") activeTrips++;
        if (t.status !== "CANCELLED" && t.delayMinutes > 5) {
          routeDelayed++;
          delayedTrips++;
        }
        totalTickets += t.tickets.length;
        totalSeats += t.busType?.totalSeats || 40;
      }

      const loadFactorPct =
        totalSeats > 0 ? Math.min(100, Math.round((totalTickets / totalSeats) * 1000) / 10) : 0;

      return {
        id: route.id,
        code: route.code,
        nameEn: route.nameEn,
        nameTe: route.nameTe,
        tripsToday: route.trips.length,
        delayedTrips: routeDelayed,
        loadFactorPct,
      };
    });

    return {
      id: depot.id,
      code: depot.code,
      nameEn: depot.nameEn,
      nameTe: depot.nameTe,
      districtId: depot.districtId,
      activeBuses,
      activeTrips,
      delayedTrips,
      totalBuses: depot.buses.length,
      routes: routeSummaries,
    };
  }

  /**
   * GET /gov/routes/:id: drill down for route.
   */
  async routeSummary(user: AuthenticatedUser, routeId: string, dateStr?: string): Promise<GovRouteSummaryDto> {
    const todayStr = dateStr || formatIstDate(new Date());

    const route = await this.prisma.route.findUnique({
      where: { id: routeId },
      include: {
        trips: {
          where: { serviceDate: toServiceDate(todayStr) },
          include: {
            busType: true,
            assignments: {
              where: { endedAt: null },
              take: 1,
              include: {
                bus: true,
                driver: { include: { user: true } },
                conductor: { include: { user: true } },
              },
            },
            tickets: {
              where: { status: { notIn: ["CANCELLED", "REFUNDED"] } },
            },
          },
          orderBy: { scheduledDepartureAt: "asc" },
        },
      },
    });

    if (!route) {
      throw new NotFoundException(`Route ${routeId} not found`);
    }

    let delayedTrips = 0;
    let totalTickets = 0;
    let totalSeats = 0;
    let busesOnRoute = 0;

    const opsTrips: OpsTripDto[] = route.trips.map((t) => {
      if (t.status !== "CANCELLED" && t.delayMinutes > 5) delayedTrips++;
      if (t.status === "RUNNING") busesOnRoute++;

      totalTickets += t.tickets.length;
      totalSeats += t.busType?.totalSeats || 40;

      const assignment = t.assignments[0]
        ? {
            id: t.assignments[0].id,
            busId: t.assignments[0].busId,
            busRegNo: t.assignments[0].bus.regNo,
            driverId: t.assignments[0].driverId,
            driverName: t.assignments[0].driver.user.name,
            conductorId: t.assignments[0].conductorId,
            conductorName: t.assignments[0].conductor?.user?.name ?? null,
            reason: t.assignments[0].reason as "INITIAL" | "REPLACEMENT",
            startedAt: t.assignments[0].startedAt.toISOString(),
            endedAt: t.assignments[0].endedAt?.toISOString() ?? null,
          }
        : null;

      return {
        id: t.id,
        code: t.code,
        status: t.status,
        displayStatus: (t.status === "RUNNING" ? (t.delayMinutes > 5 ? "DELAYED" : "RUNNING") : t.status) as DisplayStatus,
        serviceDate: formatIstDate(t.serviceDate),
        scheduledDepartureAt: t.scheduledDepartureAt.toISOString(),
        scheduledArrivalAt: t.scheduledArrivalAt.toISOString(),
        actualDepartureAt: t.actualDepartureAt?.toISOString() ?? null,
        actualArrivalAt: t.actualArrivalAt?.toISOString() ?? null,
        delayMinutes: t.delayMinutes,
        routeId: route.id,
        routeNameEn: route.nameEn,
        routeNameTe: route.nameTe,
        depotId: route.depotId,
        passengers: t.tickets.length,
        assignment,
      };
    });

    const loadFactorPct =
      totalSeats > 0 ? Math.min(100, Math.round((totalTickets / totalSeats) * 1000) / 10) : 0;

    return {
      id: route.id,
      code: route.code,
      nameEn: route.nameEn,
      nameTe: route.nameTe,
      tripsToday: route.trips.length,
      delayedTrips,
      loadFactorPct,
      busesOnRoute,
      trips: opsTrips,
    };
  }
}
