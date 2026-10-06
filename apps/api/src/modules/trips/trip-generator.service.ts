import { formatIstDate } from "@aptransit/shared";
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { generateTripsForTimetables, type TimetableInput } from "./trip-generator";

@Injectable()
export class TripGeneratorService {
  private readonly logger = new Logger(TripGeneratorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates scheduled trips for all active timetables starting from today up to `daysAhead` days.
   */
  async generateTripsForFutureDays(daysAhead = 7, now = new Date()): Promise<number> {
    const todayStr = formatIstDate(now);
    const end = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
    const endStr = formatIstDate(end);

    return this.generateRange(todayStr, endStr);
  }

  async generateRange(todayStr: string, endStr: string): Promise<number> {
    const timetables = await this.prisma.timetable.findMany({
      where: { isActive: true },
      include: {
        route: {
          include: {
            routeStops: {
              orderBy: { seq: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    const inputs: TimetableInput[] = timetables.map((t) => ({
      id: t.id,
      routeId: t.routeId,
      routeCode: t.route.code,
      busTypeId: t.busTypeId,
      departureLocal: t.departureLocal,
      daysMask: t.daysMask,
      validFrom: t.validFrom,
      validTo: t.validTo,
      isActive: t.isActive,
      durationMinutes: t.route.routeStops[0]?.minutesFromOrigin ?? 0,
    }));

    const generated = generateTripsForTimetables(inputs, todayStr, endStr);
    if (generated.length === 0) return 0;

    // Filter out trips that already exist by code
    const codes = generated.map((g) => g.code);
    const existing = await this.prisma.trip.findMany({
      where: { code: { in: codes } },
      select: { code: true },
    });
    const existingSet = new Set(existing.map((e) => e.code));

    const toCreate = generated.filter((g) => !existingSet.has(g.code));
    if (toCreate.length === 0) return 0;

    const result = await this.prisma.trip.createMany({
      data: toCreate.map((g) => ({
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

    this.logger.log(`Generated ${toCreate.length} trips for ${todayStr} to ${endStr}`);
    return result.count;
  }
}
