import {
  calculateFare,
  DEFAULT_REFUND_TIERS,
  deriveTripDisplayStatus,
  type FareDto,
  formatIstDate,
  RefundTiers,
  type RouteDto,
  type SeatMapDto,
  SeatLayoutSchema,
  type TripDetailDto,
} from "@aptransit/shared";
import { Injectable, Logger } from "@nestjs/common";
import { AppError } from "../../common/errors/app-error";
import { PrismaService } from "../../prisma/prisma.service";
import { RedisService } from "../../redis/redis.service";
import { SEAT_TAKING_STATUSES } from "../network/network.repository";

@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * GET /trips/:id (public)
   * Fetches full trip details with boarding/dropping points, timeline, seats left, and optional fare.
   */
  async getTrip(tripId: string, fromStopId?: string, toStopId?: string): Promise<TripDetailDto> {
    const tripRecord = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        busType: true,
        route: {
          include: {
            originStop: { select: { id: true, nameEn: true, nameTe: true } },
            destinationStop: { select: { id: true, nameEn: true, nameTe: true } },
            routeStops: {
              orderBy: { seq: "asc" },
              include: {
                stop: { select: { id: true, code: true, nameEn: true, nameTe: true, busStandId: true, lat: true, lng: true } },
              },
            },
          },
        },
        assignments: {
          where: { endedAt: null },
          include: {
            bus: { select: { regNo: true } },
          },
          take: 1,
        },
      },
    });

    if (!tripRecord) {
      throw new AppError("NOT_FOUND", "Trip not found");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const trip = tripRecord as any;

    const serviceDateStr = formatIstDate(trip.scheduledDepartureAt);
    const busRegNo = trip.assignments[0]?.bus?.regNo ?? null;

    const baseDepartureMs = trip.scheduledDepartureAt.getTime();

    const stops = trip.route.routeStops.map((rs: any) => {
      const scheduledArrivalAt = new Date(baseDepartureMs + rs.minutesFromOrigin * 60_000).toISOString();
      const scheduledDepartureAt = new Date(baseDepartureMs + rs.minutesFromOrigin * 60_000).toISOString();
      return {
        stopId: rs.stop.id,
        code: rs.stop.code,
        nameEn: rs.stop.nameEn,
        nameTe: rs.stop.nameTe,
        seq: rs.seq,
        kmFromOrigin: rs.kmFromOrigin,
        minutesFromOrigin: rs.minutesFromOrigin,
        isBoarding: rs.isBoarding,
        isDropping: rs.isDropping,
        scheduledArrivalAt,
        scheduledDepartureAt,
        actualArrivalAt: null,
        actualDepartureAt: null,
      };
    });

    const boardingPoints = trip.route.routeStops
      .filter((rs: any) => rs.isBoarding)
      .map((rs: any) => ({
        stopId: rs.stop.id,
        nameEn: rs.stop.nameEn,
        nameTe: rs.stop.nameTe,
        seq: rs.seq,
        kmFromOrigin: rs.kmFromOrigin,
        minutesFromOrigin: rs.minutesFromOrigin,
        departureAt: new Date(baseDepartureMs + rs.minutesFromOrigin * 60_000).toISOString(),
      }));

    const droppingPoints = trip.route.routeStops
      .filter((rs: any) => rs.isDropping)
      .map((rs: any) => ({
        stopId: rs.stop.id,
        nameEn: rs.stop.nameEn,
        nameTe: rs.stop.nameTe,
        seq: rs.seq,
        kmFromOrigin: rs.kmFromOrigin,
        minutesFromOrigin: rs.minutesFromOrigin,
        arrivalAt: new Date(baseDepartureMs + rs.minutesFromOrigin * 60_000).toISOString(),
      }));

    // Taken tickets from DB
    const takenTicketsCount = await this.prisma.ticket.count({
      where: {
        tripId,
        status: { in: [...SEAT_TAKING_STATUSES] },
      },
    });

    // Holds from Redis
    const holdCount = await this.getTripHoldCount(tripId);
    const totalTaken = takenTicketsCount + holdCount;
    const seatsLeft = Math.max(0, trip.busType.totalSeats - totalTaken);

    const displayStatus = deriveTripDisplayStatus({
      status: trip.status,
      delayMinutes: trip.delayMinutes,
      hasOpenIncident: trip.hasOpenIncident,
    });

    let farePaise: number | undefined;
    if (fromStopId && toStopId) {
      try {
        const fare = await this.getFare(tripId, fromStopId, toStopId);
        farePaise = fare.totalPaise;
      } catch {
        // Fare may not exist for some segment; leave undefined
      }
    }

    const routeDto: RouteDto = {
      id: trip.route.id,
      code: trip.route.code,
      nameEn: trip.route.nameEn,
      nameTe: trip.route.nameTe,
      distanceKm: trip.route.distanceKm,
      polyline: trip.route.polyline,
      origin: trip.route.originStop,
      destination: trip.route.destinationStop,
      stops: trip.route.routeStops.map((rs: any) => ({
        stopId: rs.stop.id,
        seq: rs.seq,
        nameEn: rs.stop.nameEn,
        nameTe: rs.stop.nameTe,
        kind: rs.stop.busStandId ? "BUS_STAND" : "STOP",
        lat: rs.stop.lat,
        lng: rs.stop.lng,
        kmFromOrigin: rs.kmFromOrigin,
        minutesFromOrigin: rs.minutesFromOrigin,
        isBoarding: rs.isBoarding,
        isDropping: rs.isDropping,
      })),
    };

    return {
      tripId: trip.id,
      serviceDate: serviceDateStr,
      route: routeDto,
      busType: {
        id: trip.busType.id,
        serviceType: trip.busType.serviceType,
        nameEn: trip.busType.nameEn,
        nameTe: trip.busType.nameTe,
        isAc: trip.busType.isAc,
        totalSeats: trip.busType.totalSeats,
        freeTravelEligible: trip.busType.freeTravelEligible,
      },
      busRegNo,
      boardingPoints,
      droppingPoints,
      stops,
      seatsLeft,
      displayStatus,
      delayMinutes: trip.delayMinutes,
      scheduledDepartureAt: trip.scheduledDepartureAt.toISOString(),
      scheduledArrivalAt: trip.scheduledArrivalAt.toISOString(),
      freeTravelEligible: trip.busType.freeTravelEligible,
      farePaise,
    };
  }

  /**
   * GET /trips/:id/seats?from&to (public)
   * Returns bus seat layout with seat states: FREE, TAKEN, HELD, BLOCKED.
   */
  async getSeats(tripId: string): Promise<SeatMapDto> {
    const tripRecord = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { busType: true },
    });

    if (!tripRecord) {
      throw new AppError("NOT_FOUND", "Trip not found");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const trip = tripRecord as any;

    const layout = SeatLayoutSchema.parse(trip.busType.seatLayout);

    // Tickets in DB taking seats
    const tickets = await this.prisma.ticket.findMany({
      where: {
        tripId,
        status: { in: [...SEAT_TAKING_STATUSES] },
        seatNo: { not: null },
      },
      select: { seatNo: true },
    });
    const takenSeatNos = new Set(tickets.map((t) => t.seatNo as string));

    // Holds in Redis: check keys hold:{tripId}:{seatNo}
    const heldSeatNos = new Set<string>();
    try {
      if (layout.labels.length > 0) {
        const holdKeys = layout.labels.map((seatNo) => `hold:${tripId}:${seatNo}`);
        const values = await this.redis.client.mget(holdKeys);
        for (let i = 0; i < layout.labels.length; i++) {
          if (values[i] !== null && values[i] !== undefined && layout.labels[i]) {
            heldSeatNos.add(layout.labels[i]!);
          }
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to read seat holds from Redis for trip ${tripId}: ${(err as Error).message}`);
    }

    // Build seats array
    const blockedLabels = new Set<string>();
    for (const blocked of layout.blockedCells) {
      const idx = blocked.row * layout.columns + blocked.col;
      if (idx >= 0 && idx < layout.labels.length && layout.labels[idx]) {
        blockedLabels.add(layout.labels[idx]!);
      }
    }

    const seats = layout.labels.map((seatNo) => {
      let state: "FREE" | "TAKEN" | "HELD" | "BLOCKED" = "FREE";
      if (blockedLabels.has(seatNo)) {
        state = "BLOCKED";
      } else if (takenSeatNos.has(seatNo)) {
        state = "TAKEN";
      } else if (heldSeatNos.has(seatNo)) {
        state = "HELD";
      }
      return { seatNo, state };
    });

    return { layout, seats };
  }

  /**
   * GET /trips/:id/fare?from&to (public)
   * Computes base fare, reservation fee, total paise, distance in km, and active refund tiers.
   */
  async getFare(tripId: string, fromStopId: string, toStopId: string): Promise<FareDto> {
    const tripRecord = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        busType: true,
        route: {
          include: {
            routeStops: {
              where: { stopId: { in: [fromStopId, toStopId] } },
              orderBy: { seq: "asc" },
            },
          },
        },
      },
    });

    if (!tripRecord) {
      throw new AppError("NOT_FOUND", "Trip not found");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const trip = tripRecord as any;

    const fromStop = trip.route.routeStops.find((rs: any) => rs.stopId === fromStopId);
    const toStop = trip.route.routeStops.find((rs: any) => rs.stopId === toStopId);

    if (!fromStop || !toStop || fromStop.seq >= toStop.seq || !fromStop.isBoarding || !toStop.isDropping) {
      throw new AppError("VALIDATION_FAILED", "Invalid boarding or dropping stop for this trip");
    }

    const distanceKm = toStop.kmFromOrigin - fromStop.kmFromOrigin;

    // Active fare rule on serviceDate
    const fareRule = await this.prisma.fareRule.findFirst({
      where: {
        busTypeId: trip.busTypeId,
        validFrom: { lte: trip.serviceDate },
        OR: [{ validTo: null }, { validTo: { gte: trip.serviceDate } }],
      },
      orderBy: { validFrom: "desc" },
    });

    if (!fareRule) {
      throw new AppError("NOT_FOUND", "No fare rule found for this trip");
    }

    const breakdown = calculateFare({
      distanceKm,
      rule: {
        baseFarePaise: fareRule.baseFarePaise,
        perKmPaise: fareRule.perKmPaise,
        minFarePaise: fareRule.minFarePaise,
        reservationFeePaise: fareRule.reservationFeePaise,
      },
    });

    // Active refund policy
    const policy = await this.prisma.refundPolicy.findFirst({
      where: { isActive: true },
      orderBy: { validFrom: "desc" },
    });

    let refundTiers = DEFAULT_REFUND_TIERS;
    if (policy && policy.tiers) {
      const parsed = RefundTiers.safeParse(policy.tiers);
      if (parsed.success) {
        refundTiers = parsed.data;
      }
    }

    return {
      basePaise: breakdown.basePaise,
      reservationFeePaise: breakdown.reservationFeePaise,
      totalPaise: breakdown.totalPaise,
      distanceKm,
      refundTiers: refundTiers.map((t) => ({ minHoursBefore: t.minHoursBefore, percent: t.percent })),
    };
  }

  private async getTripHoldCount(tripId: string): Promise<number> {
    try {
      const val = await this.redis.client.get(`holdcount:${tripId}`);
      if (val) {
        const count = parseInt(val, 10);
        return isNaN(count) ? 0 : Math.max(0, count);
      }
    } catch {
      // Redis down: return 0
    }
    return 0;
  }
}
