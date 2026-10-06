import {
  type GpsPointInput,
  type LiveBusDto,
  type LiveTripDto,
  type TrackingPingInput,
} from "@aptransit/shared";
import { Injectable, Logger } from "@nestjs/common";
import type { AuthenticatedUser } from "../../common/auth/auth.types";
import { AppError } from "../../common/errors/app-error";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { ScopeService } from "../../common/services/scope.service";
import { PrismaService } from "../../prisma/prisma.service";
import { RedisService } from "../../redis/redis.service";
import { hashDeviceKey } from "../driver/driver.service";
import {
  LIVE_TTL_SEC,
  lastSampleKey,
  type LiveState,
  liveKey,
  readLive,
  readLiveMany,
  rejectedPingsKey,
  SAMPLE_EVERY_MS,
} from "./live-state";
import { delayMinutesAt, etaSecondsTo, nextStop, reachedStop, snapToRoute } from "./progress";
import { TripNotificationsService } from "./trip-notifications.service";
import {
  displayStatusOf,
  roomsOf,
  type TripContext,
  TripContextService,
} from "./trip-context.service";

/** docs/12 GPS trust: AP bounding box [76.7, 12.6, 84.8, 19.95] plus about 50 km. */
const AP_BOX = {
  minLng: 76.7 - 0.5,
  minLat: 12.6 - 0.45,
  maxLng: 84.8 + 0.5,
  maxLat: 19.95 + 0.45,
};
const MAX_SPEED_KMH = 120;
const MAX_CLOCK_SKEW_MS = 2 * 60_000;
const MS_PER_MIN = 60_000;

export type PointProblem = "OUT_OF_BOUNDS" | "TOO_FAST" | "STALE_OR_FUTURE";

/** Sanity of one point (docs/12): inside AP plus 50 km, under 120 km/h, within 2 min of server time. */
export function checkPoint(point: GpsPointInput, now: Date): PointProblem | null {
  if (
    point.lat < AP_BOX.minLat ||
    point.lat > AP_BOX.maxLat ||
    point.lng < AP_BOX.minLng ||
    point.lng > AP_BOX.maxLng
  )
    return "OUT_OF_BOUNDS";
  if (point.speedKmh !== undefined && point.speedKmh >= MAX_SPEED_KMH) return "TOO_FAST";
  if (Math.abs(Date.parse(point.recordedAt) - now.getTime()) > MAX_CLOCK_SKEW_MS)
    return "STALE_OR_FUTURE";
  return null;
}

/** Trusted GPS ingest and the live views (docs/13). Redis holds the live state, Postgres a 30 s sample. */
@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly events: DomainEventsService,
    private readonly scope: ScopeService,
    private readonly trips: TripContextService,
    private readonly notifications: TripNotificationsService,
  ) {}

  /**
   * POST /tracking/ping. Every check from docs/12 before anything is written: an approved, not
   * revoked device of this driver, the trip RUNNING and assigned to this driver now, every point
   * sane. Rejected pings are counted (gps:rejected:{tripId}), never stored.
   */
  async ping(
    userId: string,
    deviceKey: string | undefined,
    input: TrackingPingInput,
    now = new Date(),
  ): Promise<void> {
    if (!deviceKey) throw new AppError("DEVICE_NOT_APPROVED", "Device key missing");
    const device = await this.prisma.device.findFirst({
      where: {
        deviceKeyHash: hashDeviceKey(deviceKey),
        userId,
        approvedAt: { not: null },
        revokedAt: null,
      },
      select: { id: true },
    });
    if (!device) {
      await this.countRejected(input.tripId);
      throw new AppError("DEVICE_NOT_APPROVED", "This device is not approved for this driver");
    }

    const context = await this.trips.load(input.tripId);
    if (!context.assignment || context.assignment.driverUserId !== userId) {
      await this.countRejected(input.tripId);
      throw new AppError("TRIP_NOT_ASSIGNED", "This trip is not assigned to you");
    }
    if (context.trip.status !== "RUNNING") {
      await this.countRejected(input.tripId);
      throw new AppError("TRIP_NOT_STARTABLE", "The trip is not running");
    }
    for (const point of input.points) {
      const problem = checkPoint(point, now);
      if (problem) {
        await this.countRejected(input.tripId);
        throw new AppError("VALIDATION_FAILED", "A GPS point failed the sanity checks", {
          reason: problem,
        });
      }
    }

    const latest = [...input.points]
      .sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt))
      .at(-1)!;
    const previous = await readLive(this.redis.client, input.tripId);
    if (previous && Date.parse(previous.recordedAt) >= Date.parse(latest.recordedAt)) return;
    let lastStopSeq = context.trip.lastStopSeq;
    for (const point of [...input.points].sort(
      (a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt),
    )) {
      const snap = snapToRoute([point.lat, point.lng], this.trips.geometry(context));
      lastStopSeq =
        reachedStop(context.stops, [point.lat, point.lng], snap.kmAlong, lastStopSeq)?.seq ??
        lastStopSeq;
    }
    const state = this.liveStateFor(
      { ...context, trip: { ...context.trip, lastStopSeq } },
      latest,
      now,
    );
    const delayChanged = Math.abs(state.delayMinutes - context.trip.delayMinutes) >= 2;
    if (delayChanged || lastStopSeq !== context.trip.lastStopSeq)
      await this.prisma.trip.updateMany({
        where: { id: input.tripId, status: "RUNNING" },
        data: { ...(delayChanged ? { delayMinutes: state.delayMinutes } : {}), lastStopSeq },
      });
    if (
      displayStatusOf({
        ...context.trip,
        delayMinutes: previous?.delayMinutes ?? context.trip.delayMinutes,
      }) !== displayStatusOf({ ...context.trip, delayMinutes: state.delayMinutes })
    )
      this.events.publish("trip.status", {
        tripId: input.tripId,
        status: context.trip.status,
        displayStatus: displayStatusOf({ ...context.trip, delayMinutes: state.delayMinutes }),
        delayMinutes: state.delayMinutes,
        lastStopSeq,
        rooms: roomsOf(context),
      });
    await this.redis.client.set(
      liveKey(context.trip.id),
      JSON.stringify(state),
      "EX",
      LIVE_TTL_SEC,
    );
    await this.maybeSample(context, latest, now);
    void this.notifications
      .update(context, state.delayMinutes, lastStopSeq, now)
      .catch((error: unknown) => this.logger.error("Trip notifications failed", error));

    this.events.publish("bus.position", {
      tripId: state.tripId,
      busId: state.busId,
      lat: state.lat,
      lng: state.lng,
      speedKmh: state.speedKmh,
      headingDeg: state.headingDeg,
      recordedAt: state.recordedAt,
      nextStopId: state.nextStopId,
      etaNextStopSec: state.etaNextStopSec,
      delayMinutes: state.delayMinutes,
      progressPct: state.progressPct,
      rooms: roomsOf(context),
    });
  }

  /** GET /tracking/trips/:id/live (public). */
  async live(tripId: string, now = new Date()): Promise<LiveTripDto> {
    const context = await this.trips.load(tripId);
    const state =
      context.trip.status === "RUNNING" ? await readLive(this.redis.client, tripId) : null;
    const kmAlong =
      state?.kmAlong ?? (context.trip.status === "COMPLETED" ? context.route.distanceKm : 0);
    const reached = state
      ? (context.stops.find((s) => s.seq === context.trip.lastStopSeq) ?? null)
      : context.trip.status === "COMPLETED"
        ? (context.stops.at(-1) ?? null)
        : null;
    // Before the first position the origin is the stop being waited for
    const next =
      context.trip.status === "COMPLETED"
        ? null
        : state
          ? nextStop(context.stops, kmAlong)
          : (context.stops[0] ?? null);
    const delay = state?.delayMinutes ?? context.trip.delayMinutes;

    const progress = context.stops.map((stop) => {
      const done =
        reached !== null && stop.seq <= reached.seq && (next === null || stop.seq < next.seq);
      const isCurrent = !done && next !== null && stop.seq === next.seq;
      const etaAt =
        done || context.trip.status === "CANCELLED"
          ? null
          : new Date(
              now.getTime() +
                etaSecondsTo(
                  stop,
                  reached,
                  context.trip.scheduledDepartureAt,
                  now,
                  context.trip.actualDepartureAt,
                ) *
                  1000,
            ).toISOString();
      return {
        stopId: stop.stopId,
        seq: stop.seq,
        nameEn: stop.nameEn,
        nameTe: stop.nameTe,
        state: done ? ("DONE" as const) : isCurrent ? ("CURRENT" as const) : ("UPCOMING" as const),
        etaAt,
      };
    });

    return {
      tripId,
      hasOpenIncident: context.trip.hasOpenIncident,
      incidentTypes: [
        ...new Set(
          (
            await this.prisma.incident.findMany({
              where: { tripId, status: { not: "RESOLVED" } },
              select: { type: true },
            })
          ).map((i) => i.type),
        ),
      ],
      status: context.trip.status,
      displayStatus: displayStatusOf({ ...context.trip, delayMinutes: delay }),
      position: state
        ? {
            lat: state.lat,
            lng: state.lng,
            speedKmh: state.speedKmh,
            headingDeg: state.headingDeg,
            recordedAt: state.recordedAt,
          }
        : null,
      nextStop: next
        ? { stopId: next.stopId, seq: next.seq, nameEn: next.nameEn, nameTe: next.nameTe }
        : null,
      etaNextStopSec:
        state?.etaNextStopSec ??
        (next ? etaSecondsTo(next, reached, context.trip.scheduledDepartureAt, now) : null),
      delayMinutes: delay,
      progressPct: state?.progressPct ?? (context.trip.status === "COMPLETED" ? 100 : 0),
      progress,
    };
  }

  /**
   * GET /tracking/live (ops roles). A depot needs a role on that depot (or its district, or the
   * state); a district needs that district or the state. Without filters: the caller's own depots.
   */
  async liveBuses(
    user: AuthenticatedUser,
    depotId: string | undefined,
    districtId: string | undefined,
  ): Promise<LiveBusDto[]> {
    let depotIds: string[];
    if (depotId) {
      await this.assertDepotScope(user, depotId);
      depotIds = [depotId];
    } else if (districtId) {
      this.scope.assertDistrictAccess(user, districtId);
      depotIds = (
        await this.prisma.depot.findMany({ where: { districtId }, select: { id: true } })
      ).map((d) => d.id);
    } else {
      const own = user.roles.map((r) => r.depotId).filter((id): id is string => Boolean(id));
      const statewide = user.roles.some((r) =>
        ["TRANSPORT_OFFICER", "STATE_ADMIN", "SUPER_ADMIN"].includes(r.role),
      );
      const districts = user.roles
        .map((r) => r.districtId)
        .filter((id): id is string => Boolean(id));
      const rows = statewide
        ? await this.prisma.depot.findMany({ select: { id: true } })
        : await this.prisma.depot.findMany({
            where: { OR: [{ id: { in: own } }, { districtId: { in: districts } }] },
            select: { id: true },
          });
      depotIds = rows.map((d) => d.id);
    }

    // RUNNING trips of those depots from Postgres (the record); Redis adds the positions
    const trips = await this.prisma.trip.findMany({
      where: { status: "RUNNING", route: { depotId: { in: depotIds } } },
      include: {
        route: { select: { id: true, code: true, depotId: true } },
        assignments: {
          where: { endedAt: null },
          take: 1,
          include: { bus: { select: { id: true, regNo: true } } },
        },
      },
    });
    const live = await readLiveMany(
      this.redis.client,
      trips.map((t) => t.id),
    );
    const out: LiveBusDto[] = [];
    for (const trip of trips) {
      const state = live.get(trip.id);
      const bus = trip.assignments[0]?.bus;
      if (!state || !bus) continue;
      out.push({
        tripId: trip.id,
        tripCode: trip.code,
        busId: bus.id,
        busRegNo: bus.regNo,
        routeId: trip.route.id,
        routeCode: trip.route.code,
        depotId: trip.route.depotId,
        lat: state.lat,
        lng: state.lng,
        speedKmh: state.speedKmh,
        headingDeg: state.headingDeg,
        recordedAt: state.recordedAt,
        delayMinutes: state.delayMinutes,
        displayStatus: displayStatusOf({
          status: trip.status,
          delayMinutes: state.delayMinutes,
          hasOpenIncident: trip.hasOpenIncident,
        }),
        progressPct: state.progressPct,
        nextStopId: state.nextStopId,
      });
    }
    return out;
  }

  /** Depot access: a role on the depot, the depot's district, or statewide. */
  async assertDepotScope(user: AuthenticatedUser, depotId: string): Promise<void> {
    try {
      this.scope.assertDepotAccess(user, depotId);
      return;
    } catch (err) {
      const depot = await this.prisma.depot.findUnique({
        where: { id: depotId },
        select: { districtId: true },
      });
      if (depot && user.roles.some((r) => r.districtId === depot.districtId)) return;
      throw err;
    }
  }

  private liveStateFor(context: TripContext, point: GpsPointInput, now: Date): LiveState {
    const snap = snapToRoute([point.lat, point.lng], this.trips.geometry(context));
    const reached = reachedStop(
      context.stops,
      [point.lat, point.lng],
      snap.kmAlong,
      context.trip.lastStopSeq,
    );
    const next = nextStop(context.stops, snap.kmAlong);
    return {
      tripId: context.trip.id,
      busId: context.assignment!.busId,
      lat: point.lat,
      lng: point.lng,
      speedKmh: point.speedKmh ?? null,
      headingDeg: point.headingDeg ?? null,
      recordedAt: point.recordedAt,
      kmAlong: Math.round(snap.kmAlong * 1000) / 1000,
      nextStopSeq: next?.seq ?? null,
      nextStopId: next?.stopId ?? null,
      etaNextStopSec: next
        ? etaSecondsTo(
            next,
            reached,
            context.trip.scheduledDepartureAt,
            now,
            context.trip.actualDepartureAt,
          )
        : null,
      // Live delay from the last reached stop; the trip row keeps the stored one (updated on Day 12)
      delayMinutes: delayMinutesAt(context.trip.scheduledDepartureAt, reached, now),
      progressPct: snap.progressPct,
    };
  }

  /** One gps_locations row per trip every 30 s (docs/13). */
  private async maybeSample(context: TripContext, point: GpsPointInput, now: Date): Promise<void> {
    const last = Number((await this.redis.client.get(lastSampleKey(context.trip.id))) ?? 0);
    if (now.getTime() - last < SAMPLE_EVERY_MS) return;
    await this.redis.client.set(
      lastSampleKey(context.trip.id),
      String(now.getTime()),
      "EX",
      LIVE_TTL_SEC,
    );
    await this.prisma.gpsLocation.create({
      data: {
        tripId: context.trip.id,
        busId: context.assignment!.busId,
        lat: point.lat,
        lng: point.lng,
        speedKmh: point.speedKmh ?? null,
        headingDeg: point.headingDeg ?? null,
        accuracyM: point.accuracyM ?? null,
        recordedAt: new Date(point.recordedAt),
        receivedAt: now,
      },
    });
  }

  private async countRejected(tripId: string): Promise<void> {
    try {
      await this.redis.client.incrby(rejectedPingsKey(tripId), 1);
      await this.redis.client.expire(rejectedPingsKey(tripId), (24 * 60 * MS_PER_MIN) / 1000);
    } catch {
      this.logger.warn(`Could not count a rejected ping for trip ${tripId}`);
    }
  }
}
