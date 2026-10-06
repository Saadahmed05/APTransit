import {
  calculateFare,
  DEFAULT_REFUND_TIERS,
  deriveTripDisplayStatus,
  type FareDto,
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
import { holdCountKey, holdKey } from "../bookings/seat-holds";
import { SEAT_TAKING_STATUSES } from "../network/network.repository";

const DEFAULT_CLOSE_MINUTES_BEFORE = 10;

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
  async getTrip(tripId: string, fromStopId?: string, toStopId?: string, now = new Date()): Promise<TripDetailDto> {
    const trip = await this.prisma.trip.findUnique({
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

    if (!trip) {
      throw new AppError("NOT_FOUND", "Trip not found");
    }

    const busRegNo = trip.assignments[0]?.bus?.regNo ?? null;
    const baseDepartureMs = trip.scheduledDepartureAt.getTime();
    const atStop = (minutesFromOrigin: number) => new Date(baseDepartureMs + minutesFromOrigin * 60_000).toISOString();
    const routeStops = trip.route.routeStops;

    const stops = routeStops.map((rs) => ({
      stopId: rs.stop.id,
      code: rs.stop.code,
      nameEn: rs.stop.nameEn,
      nameTe: rs.stop.nameTe,
      seq: rs.seq,
      kmFromOrigin: rs.kmFromOrigin,
      minutesFromOrigin: rs.minutesFromOrigin,
      isBoarding: rs.isBoarding,
      isDropping: rs.isDropping,
      scheduledArrivalAt: atStop(rs.minutesFromOrigin),
      scheduledDepartureAt: atStop(rs.minutesFromOrigin),
      actualArrivalAt: null,
      actualDepartureAt: null,
    }));

    const boardingPoints = routeStops
      .filter((rs) => rs.isBoarding)
      .map((rs) => ({
        stopId: rs.stop.id,
        nameEn: rs.stop.nameEn,
        nameTe: rs.stop.nameTe,
        seq: rs.seq,
        kmFromOrigin: rs.kmFromOrigin,
        minutesFromOrigin: rs.minutesFromOrigin,
        departureAt: atStop(rs.minutesFromOrigin),
      }));

    const droppingPoints = routeStops
      .filter((rs) => rs.isDropping)
      .map((rs) => ({
        stopId: rs.stop.id,
        nameEn: rs.stop.nameEn,
        nameTe: rs.stop.nameTe,
        seq: rs.seq,
        kmFromOrigin: rs.kmFromOrigin,
        minutesFromOrigin: rs.minutesFromOrigin,
        arrivalAt: atStop(rs.minutesFromOrigin),
      }));

    // Taken tickets from DB plus live holds from Redis (docs/05 seat rule: whole trip)
    const takenTicketsCount = await this.prisma.ticket.count({
      where: {
        tripId,
        status: { in: [...SEAT_TAKING_STATUSES] },
      },
    });
    const holdCount = await this.getTripHoldCount(tripId);
    const seatsLeft = Math.max(0, trip.busType.totalSeats - takenTicketsCount - holdCount);

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

    // Booking closes closeMinutesBefore departure from the boarding stop (same rule as POST /bookings)
    const boarding =
      routeStops.find((rs) => rs.stopId === fromStopId && rs.isBoarding) ?? routeStops.find((rs) => rs.isBoarding);
    const closeMinutes = (await this.settingNumber("booking.closeMinutesBefore")) ?? DEFAULT_CLOSE_MINUTES_BEFORE;
    const boardingDepartureMs = baseDepartureMs + (boarding?.minutesFromOrigin ?? 0) * 60_000;
    const bookingOpen =
      (trip.status === "SCHEDULED" || trip.status === "RUNNING") &&
      boardingDepartureMs > now.getTime() + closeMinutes * 60_000;

    const routeDto: RouteDto = {
      id: trip.route.id,
      code: trip.route.code,
      nameEn: trip.route.nameEn,
      nameTe: trip.route.nameTe,
      distanceKm: trip.route.distanceKm,
      polyline: trip.route.polyline,
      origin: trip.route.originStop,
      destination: trip.route.destinationStop,
      stops: routeStops.map((rs) => ({
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
      serviceDate: trip.serviceDate.toISOString().slice(0, 10),
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
      bookingOpen,
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
   * A seat is taken for the whole trip (docs/05), so from and to do not change the map yet.
   */
  async getSeats(tripId: string): Promise<SeatMapDto> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { busType: true },
    });

    if (!trip) {
      throw new AppError("NOT_FOUND", "Trip not found");
    }

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

    // Holds in Redis: hold:{tripId}:{seatNo}, one MGET for the bus
    const heldSeatNos = new Set<string>();
    try {
      if (layout.labels.length > 0) {
        const values = await this.redis.client.mget(layout.labels.map((seatNo) => holdKey(tripId, seatNo)));
        layout.labels.forEach((seatNo, i) => {
          if (values[i] !== null && values[i] !== undefined) heldSeatNos.add(seatNo);
        });
      }
    } catch (err) {
      this.logger.warn(`Failed to read seat holds from Redis for trip ${tripId}: ${(err as Error).message}`);
    }

    const blockedLabels = new Set<string>();
    for (const blocked of layout.blockedCells) {
      const idx = blocked.row * layout.columns + blocked.col;
      const label = layout.labels[idx];
      if (label) blockedLabels.add(label);
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
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
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

    if (!trip) {
      throw new AppError("NOT_FOUND", "Trip not found");
    }

    const fromStop = trip.route.routeStops.find((rs) => rs.stopId === fromStopId);
    const toStop = trip.route.routeStops.find((rs) => rs.stopId === toStopId);

    if (!fromStop || !toStop || fromStop.seq >= toStop.seq || !fromStop.isBoarding || !toStop.isDropping) {
      throw new AppError("VALIDATION_FAILED", "Invalid boarding or dropping stop for this trip");
    }

    const distanceKm = toStop.kmFromOrigin - fromStop.kmFromOrigin;

    // Active fare rule on serviceDate
    const fareRule = await this.prisma.fareRule.findFirst({
      where: {
        busTypeId: trip.busTypeId,
        validFrom: { lte: trip.scheduledDepartureAt },
        OR: [{ validTo: null }, { validTo: { gte: trip.scheduledDepartureAt } }],
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
      where: { validFrom: { lte: new Date() } },
      orderBy: { validFrom: "desc" },
    });

    let refundTiers = DEFAULT_REFUND_TIERS;
    if (policy?.tiers) {
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
      const count = Number.parseInt((await this.redis.client.get(holdCountKey(tripId))) ?? "0", 10);
      return Number.isFinite(count) ? Math.max(0, count) : 0;
    } catch {
      // Redis down: holds unknown, show the ticket count only
      return 0;
    }
  }

  private async settingNumber(key: string): Promise<number | null> {
    try {
      const row = await this.prisma.setting.findUnique({ where: { key }, select: { value: true } });
      return typeof row?.value === "number" ? row.value : null;
    } catch {
      return null;
    }
  }
}
