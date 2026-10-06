import { createHash, randomBytes } from "node:crypto";
import {
  type DriverIncidentInput,
  type DriverTodayDto,
  type DriverTripSummaryDto,
  formatIstDate,
  generateIncidentCode,
  type IncidentDto,
  type RegisterDeviceResult,
  type TripDto,
} from "@aptransit/shared";
import { Injectable, Logger } from "@nestjs/common";
import { AppError } from "../../common/errors/app-error";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { PrismaService } from "../../prisma/prisma.service";
import { RedisService } from "../../redis/redis.service";
import { AuditService, type LogAuditParams } from "../audit/audit.service";
import { depotLiveKey, readLive } from "../tracking/live-state";
import { TripNotificationsService } from "../tracking/trip-notifications.service";
import { displayStatusOf, roomsOf, type TripContext, TripContextService, toTripDto } from "../tracking/trip-context.service";

type AuditActor = Pick<LogAuditParams, "actorUserId" | "actorRole" | "ip" | "userAgent">;

const MS_PER_MIN = 60_000;
/** A trip can be started from 60 min before its departure until 60 min after it (Day 11). */
export const START_WINDOW_MINUTES = 60;
/** Incidents a bus cannot run with: the bus is marked BREAKDOWN. */
const BREAKDOWN_TYPES = new Set(["BREAKDOWN"]);

/** Device keys are random 32 bytes, stored only as a SHA 256 hash (as the seed does). */
export function hashDeviceKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Start of the IST service date as stored in trips.serviceDate (UTC midnight of the IST date). */
function serviceDateOf(now: Date): Date {
  return new Date(`${formatIstDate(now)}T00:00:00.000Z`);
}

/** docs/06 Driver. DRIVER only; every trip rule checks the open assignment of this driver. */
@Injectable()
export class DriverService {
  private readonly logger = new Logger(DriverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly events: DomainEventsService,
    private readonly trips: TripContextService,
    private readonly notifications: TripNotificationsService,
  ) {}

  /** The key is returned once and never stored in clear. Approval is a depot action (Day 14). */
  async registerDevice(userId: string, label: string, actor: AuditActor): Promise<RegisterDeviceResult> {
    const deviceKey = randomBytes(32).toString("base64url");
    const device = await this.prisma.device.create({ data: { userId, label, deviceKeyHash: hashDeviceKey(deviceKey) } });
    await this.audit.log({ action: "device.register", entityType: "device", entityId: device.id, after: { label }, ...actor });
    return { deviceId: device.id, deviceKey };
  }

  async today(userId: string, deviceKey: string | undefined, now = new Date()): Promise<DriverTodayDto> {
    const [user, devices, assignments] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
      this.prisma.device.findMany({ where: { userId, revokedAt: null }, select: { approvedAt: true, deviceKeyHash: true } }),
      this.todaysAssignments(userId, now),
    ]);
    const deviceRegistered = devices.length > 0;
    const deviceApproved = devices.some((d) => d.approvedAt !== null);
    const mine = deviceKey ? devices.find((d) => d.deviceKeyHash === hashDeviceKey(deviceKey)) : undefined;
    const thisDevice = mine ? (mine.approvedAt ? ("APPROVED" as const) : ("PENDING" as const)) : null;

    // The running trip, else the next one not more than 60 min late to start
    const pick =
      assignments.find((a) => a.trip.status === "RUNNING") ??
      assignments.find((a) => a.trip.status === "SCHEDULED" && a.trip.scheduledDepartureAt.getTime() + START_WINDOW_MINUTES * MS_PER_MIN >= now.getTime());
    const empty: DriverTodayDto = {
      driverName: user?.name ?? null,
      assignment: null,
      trip: null,
      bus: null,
      route: null,
      stops: [],
      startableFrom: null,
      deviceRegistered,
      deviceApproved,
      thisDevice,
    };
    if (!pick) return empty;

    const context = await this.trips.load(pick.trip.id);
    return {
      ...empty,
      assignment: { id: pick.id },
      trip: toTripDto(context.trip),
      bus: context.assignment ? { id: context.assignment.busId, regNo: context.assignment.busRegNo } : null,
      route: {
        id: context.route.id,
        code: context.route.code,
        nameEn: context.route.nameEn,
        nameTe: context.route.nameTe,
        distanceKm: context.route.distanceKm,
        polyline: context.route.polyline,
      },
      stops: context.stops.map(({ stopId, seq, nameEn, nameTe, lat, lng, kmFromOrigin, minutesFromOrigin }) => ({
        stopId,
        seq,
        nameEn,
        nameTe,
        lat,
        lng,
        kmFromOrigin,
        minutesFromOrigin,
      })),
      startableFrom: new Date(context.trip.scheduledDepartureAt.getTime() - START_WINDOW_MINUTES * MS_PER_MIN).toISOString(),
    };
  }

  /** GET /driver/trips: today's assignments (the simulator and a later trip list use it). */
  async todaysTrips(userId: string, now = new Date()): Promise<DriverTripSummaryDto[]> {
    const assignments = await this.todaysAssignments(userId, now);
    return assignments.map((a) => ({
      tripId: a.trip.id,
      code: a.trip.code,
      status: a.trip.status,
      routeId: a.trip.route.id,
      routeCode: a.trip.route.code,
      depotCode: a.trip.route.depot.code,
      scheduledDepartureAt: a.trip.scheduledDepartureAt.toISOString(),
      scheduledArrivalAt: a.trip.scheduledArrivalAt.toISOString(),
    }));
  }

  /** SCHEDULED to RUNNING: this driver's trip, an approved device, inside the start window. */
  async startTrip(userId: string, tripId: string, actor: AuditActor, now = new Date()): Promise<TripDto> {
    const context = await this.assigned(userId, tripId);
    await this.assertApprovedDevice(userId);
    const departure = context.trip.scheduledDepartureAt.getTime();
    const inWindow = Math.abs(now.getTime() - departure) <= START_WINDOW_MINUTES * MS_PER_MIN;
    if (context.trip.status !== "SCHEDULED" || !inWindow) {
      throw new AppError("TRIP_NOT_STARTABLE", "This trip cannot be started now", {
        startableFrom: new Date(departure - START_WINDOW_MINUTES * MS_PER_MIN).toISOString(),
      });
    }

    const { count } = await this.prisma.trip.updateMany({
      where: { id: tripId, status: "SCHEDULED" },
      data: { status: "RUNNING", actualDepartureAt: now },
    });
    if (count !== 1) throw new AppError("TRIP_NOT_STARTABLE", "This trip cannot be started now");
    await this.prisma.bus.updateMany({ where: { id: context.assignment!.busId, status: { in: ["IDLE", "DELAYED"] } }, data: { status: "RUNNING" } });
    await this.redisCall((client) => client.sadd(depotLiveKey(context.route.depotId), tripId));

    await this.audit.log({ action: "trip.start", entityType: "trip", entityId: tripId, before: { status: "SCHEDULED" }, after: { status: "RUNNING" }, ...actor });
    const fresh = await this.trips.load(tripId);
    this.publishStatus(fresh);
    void this.notifications.update(fresh, fresh.trip.delayMinutes, fresh.trip.lastStopSeq, now, true).catch((error: unknown) => this.logger.error("Trip notifications failed", error));
    return toTripDto(fresh.trip);
  }

  /** RUNNING to COMPLETED. */
  async endTrip(userId: string, tripId: string, actor: AuditActor, now = new Date()): Promise<TripDto> {
    const context = await this.assigned(userId, tripId);
    const { count } = await this.prisma.trip.updateMany({
      where: { id: tripId, status: "RUNNING" },
      data: { status: "COMPLETED", actualArrivalAt: now },
    });
    if (count !== 1) throw new AppError("TRIP_NOT_STARTABLE", "Only a running trip can be ended");
    await this.prisma.bus.updateMany({ where: { id: context.assignment!.busId, status: { in: ["RUNNING", "DELAYED"] } }, data: { status: "IDLE" } });
    await this.redisCall((client) => client.srem(depotLiveKey(context.route.depotId), tripId));

    await this.audit.log({ action: "trip.end", entityType: "trip", entityId: tripId, before: { status: "RUNNING" }, after: { status: "COMPLETED" }, ...actor });
    const fresh = await this.trips.load(tripId);
    this.publishStatus(fresh);
    return toTripDto(fresh.trip);
  }

  /**
   * POST /driver/incidents. The server fills trip and bus from the driver's running (or next)
   * assignment and the location from bus:live, else the last gps_locations row, else the last
   * reached or first stop. Client supplied trip or bus ids are never accepted (strict schema).
   */
  async reportIncident(userId: string, input: DriverIncidentInput, actor: AuditActor, now = new Date()): Promise<IncidentDto> {
    const assignments = await this.todaysAssignments(userId, now);
    const pick = assignments.find((a) => a.trip.status === "RUNNING") ?? assignments.find((a) => a.trip.status === "SCHEDULED");
    if (!pick) throw new AppError("TRIP_NOT_ASSIGNED", "No trip is assigned to you now");
    const context = await this.trips.load(pick.trip.id);
    if (!context.assignment) throw new AppError("TRIP_NOT_ASSIGNED", "No trip is assigned to you now");

    const location = await this.locate(context);
    const incident = await this.prisma.$transaction(async (tx) => {
      const row = await tx.incident.create({
        data: {
          code: generateIncidentCode(),
          type: input.type,
          severity: input.severity ?? "MEDIUM",
          status: "OPEN",
          tripId: context.trip.id,
          busId: context.assignment!.busId,
          reportedById: userId,
          lat: location.lat,
          lng: location.lng,
          note: input.note?.length ? input.note : null,
        },
      });
      await tx.trip.update({ where: { id: context.trip.id }, data: { hasOpenIncident: true } });
      if (BREAKDOWN_TYPES.has(input.type)) await tx.bus.update({ where: { id: context.assignment!.busId }, data: { status: "BREAKDOWN" } });
      return row;
    });

    const dto: IncidentDto = {
      id: incident.id,
      code: incident.code,
      type: incident.type,
      severity: incident.severity,
      status: incident.status,
      tripId: incident.tripId,
      busId: incident.busId,
      lat: incident.lat,
      lng: incident.lng,
      note: incident.note,
      createdAt: incident.createdAt.toISOString(),
    };
    await this.audit.log({ action: "incident.create", entityType: "incident", entityId: incident.id, after: { type: dto.type, severity: dto.severity, tripId: dto.tripId }, ...actor });
    this.events.publish("incident.created", { ...dto, rooms: roomsOf(context) });
    return dto;
  }

  private async locate(context: TripContext): Promise<{ lat: number; lng: number }> {
    const live = await readLive(this.redis.client, context.trip.id);
    if (live) return { lat: live.lat, lng: live.lng };
    const last = await this.prisma.gpsLocation.findFirst({ where: { tripId: context.trip.id }, orderBy: { recordedAt: "desc" }, select: { lat: true, lng: true } });
    if (last) return last;
    const stop = context.stops.find((s) => s.seq === context.trip.lastStopSeq) ?? context.stops[0];
    return { lat: stop?.lat ?? 0, lng: stop?.lng ?? 0 };
  }

  /** The trip, with its open assignment belonging to this driver. */
  private async assigned(userId: string, tripId: string): Promise<TripContext> {
    const context = await this.trips.load(tripId);
    if (!context.assignment || context.assignment.driverUserId !== userId) {
      throw new AppError("TRIP_NOT_ASSIGNED", "This trip is not assigned to you");
    }
    return context;
  }

  private async assertApprovedDevice(userId: string): Promise<void> {
    const approved = await this.prisma.device.count({ where: { userId, approvedAt: { not: null }, revokedAt: null } });
    if (approved === 0) throw new AppError("DEVICE_NOT_APPROVED", "This phone is waiting for depot approval");
  }

  private todaysAssignments(userId: string, now: Date) {
    return this.prisma.tripAssignment.findMany({
      where: {
        endedAt: null,
        driver: { userId },
        trip: { serviceDate: serviceDateOf(now), status: { in: ["SCHEDULED", "RUNNING"] } },
      },
      include: { trip: { include: { route: { include: { depot: { select: { code: true } } } } } } },
      orderBy: { trip: { scheduledDepartureAt: "asc" } },
    });
  }

  private publishStatus(context: TripContext): void {
    this.events.publish("trip.status", {
      tripId: context.trip.id,
      status: context.trip.status,
      displayStatus: displayStatusOf(context.trip),
      delayMinutes: context.trip.delayMinutes,
      lastStopSeq: context.trip.lastStopSeq,
      rooms: roomsOf(context),
    });
  }

  private async redisCall(work: (client: RedisService["client"]) => Promise<unknown>): Promise<void> {
    try {
      await work(this.redis.client);
    } catch (err) {
      // The live set is rebuilt from RUNNING trips by the next start or end; never fail the trip for Redis
      this.logger.warn(`Redis live set update failed: ${(err as Error).message}`);
    }
  }
}
