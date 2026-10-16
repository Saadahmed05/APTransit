import { formatIstDate, type ServiceType } from "@aptransit/shared";
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { Prisma } from "../../generated/prisma/client";
import { addDateDays, generateTripsForTimetables, type TimetableInput } from "./trip-generator";

/** Booking window when the `booking.daysAhead` setting is missing (docs/07 settings). */
export const DEFAULT_WINDOW_DAYS = 30;
/** Rows per createMany: well under the Postgres bind limit. */
const INSERT_BATCH = 1_000;

/**
 * D-048: the `trips.autoAssign` setting. Generated trips on these routes get the demo crew and
 * buses, so the driver and conductor apps keep having trips after the seed window.
 */
export interface AutoAssignSetting {
  routeCodes: string[];
  driverEmployeeCode: string;
  conductorEmployeeCode?: string;
  busRegNos: string[];
  assignedByEmail: string;
}

type Db = Prisma.TransactionClient | PrismaService;

@Injectable()
export class TripGeneratorService {
  private readonly logger = new Logger(TripGeneratorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates scheduled trips for all active timetables starting from today up to `daysAhead` days.
   */
  async generateTripsForFutureDays(daysAhead = 7, now = new Date()): Promise<number> {
    const todayStr = formatIstDate(now);
    return this.generateRange(todayStr, addDateDays(todayStr, daysAhead));
  }

  /** Days ahead that trips must exist for: the booking window (`booking.daysAhead`). */
  async windowDays(db: Db = this.prisma): Promise<number> {
    const row = await db.setting.findUnique({ where: { key: "booking.daysAhead" } });
    const value = typeof row?.value === "number" ? row.value : Number(row?.value);
    return Number.isInteger(value) && value > 0 && value <= 366 ? value : DEFAULT_WINDOW_DAYS;
  }

  /**
   * Creates the missing trips from startStr to endStr (IST dates, both included), one day at a time.
   * A trip exists when its (timetable, service date) pair exists, whatever its code format.
   */
  async generateRange(startStr: string, endStr: string, db: Db = this.prisma): Promise<number> {
    const inputs = await this.activeTimetables(db);
    if (inputs.length === 0) return 0;

    let created = 0;
    for (let day = startStr; day <= endStr; day = addDateDays(day, 1)) {
      const generated = generateTripsForTimetables(inputs, day, day);
      if (generated.length === 0) continue;
      const existing = await db.trip.findMany({
        where: { serviceDate: generated[0]!.serviceDate, timetableId: { in: generated.map((g) => g.timetableId) } },
        select: { timetableId: true },
      });
      const have = new Set(existing.map((e) => e.timetableId));
      const toCreate = generated.filter((g) => !have.has(g.timetableId));
      for (let i = 0; i < toCreate.length; i += INSERT_BATCH) {
        const result = await db.trip.createMany({
          data: toCreate.slice(i, i + INSERT_BATCH).map((g) => ({
            code: g.code,
            timetableId: g.timetableId,
            routeId: g.routeId,
            busTypeId: g.busTypeId,
            serviceDate: g.serviceDate,
            scheduledDepartureAt: g.scheduledDepartureAt,
            scheduledArrivalAt: g.scheduledArrivalAt,
            status: g.status,
            delayMinutes: g.delayMinutes,
            hasOpenIncident: g.hasOpenIncident,
          })),
          skipDuplicates: true,
        });
        created += result.count;
      }
    }

    if (created > 0) this.logger.log(`Generated ${created} trips for ${startStr} to ${endStr}`);
    return created;
  }

  /**
   * Future trips of timetables that were switched off, with nothing sold or recorded on them, are
   * removed so search stops showing them. Trips with any booking, ticket, scan, GPS point or
   * incident always stay.
   */
  async pruneInactiveFuture(todayStr: string, db: Db = this.prisma): Promise<number> {
    const stale = await db.trip.findMany({
      where: {
        serviceDate: { gte: new Date(`${todayStr}T00:00:00.000Z`) },
        status: "SCHEDULED",
        timetable: { isActive: false },
        bookings: { none: {} },
        tickets: { none: {} },
        scans: { none: {} },
        gpsLocations: { none: {} },
        incidents: { none: {} },
      },
      select: { id: true },
    });
    if (stale.length === 0) return 0;
    const ids = stale.map((t) => t.id);
    await db.tripAssignment.deleteMany({ where: { tripId: { in: ids } } });
    const result = await db.trip.deleteMany({ where: { id: { in: ids } } });
    this.logger.log(`Removed ${result.count} unsold future trips of inactive timetables`);
    return result.count;
  }

  /** Gives unassigned trips on the `trips.autoAssign` routes the demo crew (round robin over buses). */
  async applyAutoAssign(startStr: string, endStr: string, db: Db = this.prisma): Promise<number> {
    const row = await db.setting.findUnique({ where: { key: "trips.autoAssign" } });
    const setting = row?.value as AutoAssignSetting | undefined;
    if (!setting?.routeCodes?.length || !setting.busRegNos?.length) return 0;

    const [driver, conductor, buses, assigner] = await Promise.all([
      db.driver.findFirst({ where: { employeeCode: setting.driverEmployeeCode } }),
      setting.conductorEmployeeCode
        ? db.conductor.findFirst({ where: { employeeCode: setting.conductorEmployeeCode } })
        : null,
      db.bus.findMany({ where: { regNo: { in: setting.busRegNos } }, select: { id: true }, orderBy: { regNo: "asc" } }),
      db.user.findUnique({ where: { email: setting.assignedByEmail } }),
    ]);
    if (!driver || !assigner || buses.length === 0) return 0;

    const trips = await db.trip.findMany({
      where: {
        serviceDate: { gte: new Date(`${startStr}T00:00:00.000Z`), lte: new Date(`${endStr}T00:00:00.000Z`) },
        route: { code: { in: setting.routeCodes } },
        assignments: { none: {} },
      },
      select: { id: true, scheduledDepartureAt: true },
      orderBy: { scheduledDepartureAt: "asc" },
    });
    if (trips.length === 0) return 0;
    const result = await db.tripAssignment.createMany({
      data: trips.map((trip, i) => ({
        tripId: trip.id,
        busId: buses[i % buses.length]!.id,
        driverId: driver.id,
        conductorId: conductor?.id ?? null,
        reason: "INITIAL" as const,
        assignedById: assigner.id,
        startedAt: trip.scheduledDepartureAt,
      })),
    });
    return result.count;
  }

  private async activeTimetables(db: Db): Promise<TimetableInput[]> {
    const [timetables, busTypes] = await Promise.all([
      db.timetable.findMany({
        where: { isActive: true },
        include: { route: { include: { routeStops: { orderBy: { seq: "desc" }, take: 1 } } } },
      }),
      db.busType.findMany({ select: { id: true, serviceType: true } }),
    ]);
    const serviceOf = new Map(busTypes.map((b) => [b.id, b.serviceType as ServiceType]));
    return timetables.flatMap((t) => {
      const serviceType = serviceOf.get(t.busTypeId);
      if (!serviceType) return [];
      return [
        {
          id: t.id,
          routeId: t.routeId,
          routeCode: t.route.code,
          busTypeId: t.busTypeId,
          serviceType,
          departureLocal: t.departureLocal,
          daysMask: t.daysMask,
          validFrom: t.validFrom,
          validTo: t.validTo,
          isActive: t.isActive,
          durationMinutes: t.route.routeStops[0]?.minutesFromOrigin ?? 0,
        },
      ];
    });
  }
}
