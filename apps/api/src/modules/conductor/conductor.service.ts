import {
  type ConductorAlightingDto,
  type ConductorManifestDto,
  type ConductorTodayDto,
  formatIstDate,
  isSeatless,
  segmentKm,
} from "@aptransit/shared";
import { Injectable } from "@nestjs/common";
import { AppError } from "../../common/errors/app-error";
import { PrismaService } from "../../prisma/prisma.service";
import { RedisService } from "../../redis/redis.service";
import { readLive } from "../tracking/live-state";
import { toTripDto } from "../tracking/trip-context.service";
import { alightingPlan, nextStopSeqOf } from "./alighting";

@Injectable()
export class ConductorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async assignment(userId: string, tripId?: string, now = new Date()) {
    const rows = await this.prisma.tripAssignment.findMany({
      where: {
        endedAt: null,
        conductor: { userId },
        trip: {
          serviceDate: new Date(`${formatIstDate(now)}T00:00:00.000Z`),
          status: { in: ["RUNNING", "SCHEDULED"] },
          ...(tripId ? { id: tripId } : {}),
        },
      },
      include: {
        conductor: true,
        bus: { include: { busType: true } },
        trip: { include: { route: true } },
      },
      orderBy: { trip: { scheduledDepartureAt: "asc" } },
    });
    return rows.find((a) => a.trip.status === "RUNNING") ?? rows[0] ?? null;
  }

  async current(userId: string, tripId: string, now = new Date()) {
    const assignment = await this.prisma.tripAssignment.findFirst({
      relationLoadStrategy: "join",
      where: {
        endedAt: null,
        conductor: { userId },
        trip: { status: "RUNNING", serviceDate: new Date(`${formatIstDate(now)}T00:00:00.000Z`) },
      },
      select: {
        tripId: true,
        conductorId: true,
        busId: true,
        bus: { select: { busType: { select: { serviceType: true } } } },
        trip: {
          select: {
            status: true,
            lastStopSeq: true,
            route: {
              select: {
                nameEn: true,
                nameTe: true,
                depot: { select: { districtId: true } },
                // D-035: the stops of the route, for the boarding stop and the segment checks
                routeStops: {
                  orderBy: { seq: "asc" },
                  select: { stopId: true, seq: true, stop: { select: { lat: true, lng: true, nameEn: true, nameTe: true } } },
                },
              },
            },
          },
        },
      },
      orderBy: { trip: { scheduledDepartureAt: "asc" } },
    });
    if (!assignment || assignment.tripId !== tripId || assignment.trip.status !== "RUNNING")
      throw new AppError("FORBIDDEN", "This is not the conductor's current running trip");
    return assignment;
  }

  async manifest(userId: string, tripId: string): Promise<ConductorManifestDto> {
    const assignment = await this.assignment(userId, tripId);
    if (!assignment) throw new AppError("FORBIDDEN", "This trip is not assigned to you");
    return this.counts(tripId);
  }

  /** D-044: who gets down at the stops ahead, from the tickets checked on this bus. */
  async alighting(userId: string, tripId: string, now = new Date()): Promise<ConductorAlightingDto> {
    const assignment = await this.assignment(userId, tripId, now);
    if (!assignment) throw new AppError("FORBIDDEN", "This trip is not assigned to you");
    const [routeStops, scans, live] = await Promise.all([
      this.prisma.routeStop.findMany({
        where: { routeId: assignment.trip.routeId },
        orderBy: { seq: "asc" },
        select: { stopId: true, seq: true, stop: { select: { nameEn: true, nameTe: true } } },
      }),
      // Every ticket checked on this bus, booked on it or accepted by the class rule
      this.prisma.ticketScan.findMany({
        where: { tripId, result: "VALID", ticketId: { not: null } },
        select: { ticket: { select: { droppingStopId: true } } },
      }),
      readLive(this.redis.client, tripId),
    ]);
    const stops = routeStops.map((rs) => ({ stopId: rs.stopId, seq: rs.seq, nameEn: rs.stop.nameEn, nameTe: rs.stop.nameTe }));
    return alightingPlan(
      stops,
      scans.flatMap((scan) => (scan.ticket ? [scan.ticket.droppingStopId] : [])),
      nextStopSeqOf(live?.nextStopSeq, assignment.trip.lastStopSeq, stops.at(-1)?.seq ?? 0),
    );
  }

  private async counts(tripId: string): Promise<ConductorManifestDto> {
    const [tickets, passScans, otherBusScans, trip] = await Promise.all([
      this.prisma.ticket.findMany({
        where: { tripId, status: { in: ["BOOKED", "ACTIVE", "SCANNED", "USED"] } },
        select: { seatNo: true, status: true, boardingStopId: true, droppingStopId: true },
      }),
      this.prisma.ticketScan.count({ where: { tripId, passId: { not: null }, result: "VALID" } }),
      // D-044: tickets of another bus accepted here by the class rule
      this.prisma.ticketScan.count({
        where: { tripId, result: "VALID", ticket: { tripId: { not: tripId } } },
      }),
      this.prisma.trip.findUnique({
        where: { id: tripId },
        select: {
          busType: { select: { serviceType: true } },
          route: { select: { routeStops: { select: { stopId: true, kmFromOrigin: true } } } },
        },
      }),
    ]);
    const checked =
      tickets.filter((t) => ["SCANNED", "USED"].includes(t.status)).length + passScans + otherBusScans;
    const passengers = tickets.length + passScans + otherBusScans;
    return {
      counts: { passengers, checked, pending: passengers - checked },
      seats: tickets.map((t) => ({
        // D-046: local tickets have no seat, so the manifest shows them as unreserved
        seatNo:
          trip &&
          isSeatless(
            trip.busType.serviceType,
            segmentKm(trip.route.routeStops, t.boardingStopId, t.droppingStopId),
          )
            ? null
            : t.seatNo,
        state: ["SCANNED", "USED"].includes(t.status) ? "CHECKED" : "PENDING",
      })),
    };
  }

  async today(userId: string): Promise<ConductorTodayDto> {
    const assignment = await this.assignment(userId);
    if (!assignment)
      return { trip: null, route: null, counts: { passengers: 0, checked: 0, pending: 0 } };
    return {
      trip: toTripDto(assignment.trip),
      route: { nameEn: assignment.trip.route.nameEn, nameTe: assignment.trip.route.nameTe },
      counts: (await this.counts(assignment.tripId)).counts,
    };
  }
}
