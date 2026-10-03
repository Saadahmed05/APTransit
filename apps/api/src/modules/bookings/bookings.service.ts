import {
  type BookingDto,
  calculateFare,
  type CreateBookingInput,
  generateBookingCode,
  SeatLayoutSchema,
} from "@aptransit/shared";
import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { AppError } from "../../common/errors/app-error";
import { PrismaService } from "../../prisma/prisma.service";
import { RedisService } from "../../redis/redis.service";
import { SEAT_TAKING_STATUSES } from "../network/network.repository";
import { QUEUES } from "../queue/queue.constants";

const DEFAULT_MAX_PASSENGERS = 6;
const DEFAULT_DAYS_AHEAD = 30;
const DEFAULT_CLOSE_MINUTES_BEFORE = 10;
const DEFAULT_HOLD_MINUTES = 10;

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @InjectQueue(QUEUES.EXPIRY) private readonly expiryQueue?: Queue,
  ) {}

  /**
   * POST /bookings (user)
   * Holds seats atomically in Redis and creates booking in PENDING_PAYMENT state.
   */
  async createBooking(
    userId: string,
    input: CreateBookingInput,
    idempotencyKey?: string,
    now = new Date(),
  ): Promise<BookingDto> {
    // 1. Check idempotency
    if (idempotencyKey) {
      try {
        const cached = await this.redis.client.get(`idemp:booking:${userId}:${idempotencyKey}`);
        if (cached) {
          return JSON.parse(cached) as BookingDto;
        }
      } catch {
        // Continue if Redis cache lookup fails
      }
    }

    // 2. Validate settings
    const maxPassengers = (await this.getSettingNumber("booking.maxPassengers")) ?? DEFAULT_MAX_PASSENGERS;
    const daysAhead = (await this.getSettingNumber("booking.daysAhead")) ?? DEFAULT_DAYS_AHEAD;
    const closeMinutesBefore = (await this.getSettingNumber("booking.closeMinutesBefore")) ?? DEFAULT_CLOSE_MINUTES_BEFORE;
    const holdMinutes = (await this.getSettingNumber("booking.holdMinutes")) ?? DEFAULT_HOLD_MINUTES;

    if (input.passengers.length > maxPassengers) {
      throw new AppError("VALIDATION_FAILED", `Maximum ${maxPassengers} passengers allowed per booking`);
    }

    // 3. Find trip and route stops
    const trip = await this.prisma.trip.findUnique({
      where: { id: input.tripId },
      include: {
        busType: true,
        route: {
          include: {
            routeStops: {
              where: { stopId: { in: [input.boardingStopId, input.droppingStopId] } },
              orderBy: { seq: "asc" },
            },
          },
        },
      },
    });

    if (!trip || trip.status === "CANCELLED") {
      throw new AppError("NOT_FOUND", "Trip not found or cancelled");
    }

    // Check days ahead
    const maxDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
    if (trip.scheduledDepartureAt.getTime() > maxDate.getTime()) {
      throw new AppError("VALIDATION_FAILED", `Bookings are open up to ${daysAhead} days in advance`);
    }

    const boardingStop = trip.route.routeStops.find((rs) => rs.stopId === input.boardingStopId);
    const droppingStop = trip.route.routeStops.find((rs) => rs.stopId === input.droppingStopId);

    if (!boardingStop || !droppingStop || boardingStop.seq >= droppingStop.seq || !boardingStop.isBoarding || !droppingStop.isDropping) {
      throw new AppError("VALIDATION_FAILED", "Boarding stop must be before dropping stop on the route");
    }

    // Check booking close time
    const boardingDepartureMs = trip.scheduledDepartureAt.getTime() + boardingStop.minutesFromOrigin * 60_000;
    if (boardingDepartureMs <= now.getTime() + closeMinutesBefore * 60_000) {
      throw new AppError("VALIDATION_FAILED", "Booking is closed for this trip");
    }

    // 4. Validate seat numbers
    const layout = SeatLayoutSchema.parse(trip.busType.seatLayout);
    const validSeatLabels = new Set(layout.labels);

    const blockedLabels = new Set<string>();
    for (const blocked of layout.blockedCells) {
      const idx = blocked.row * layout.columns + blocked.col;
      if (idx >= 0 && idx < layout.labels.length && layout.labels[idx]) {
        blockedLabels.add(layout.labels[idx]!);
      }
    }

    const seatNos = input.passengers.map((p) => p.seatNo);
    if (new Set(seatNos).size !== seatNos.length) {
      throw new AppError("VALIDATION_FAILED", "Duplicate seats selected in booking");
    }

    for (const seatNo of seatNos) {
      if (!validSeatLabels.has(seatNo) || blockedLabels.has(seatNo)) {
        throw new AppError("VALIDATION_FAILED", `Seat ${seatNo} is invalid or blocked`, { seatNo });
      }
    }

    // 5. Check DB tickets for those seats
    const existingTickets = await this.prisma.ticket.findMany({
      where: {
        tripId: trip.id,
        seatNo: { in: seatNos },
        status: { in: [...SEAT_TAKING_STATUSES] },
      },
      select: { seatNo: true },
    });

    if (existingTickets.length > 0) {
      const takenSeat = existingTickets[0]?.seatNo ?? seatNos[0] ?? "unknown";
      throw new AppError("SEAT_TAKEN", `Seat ${takenSeat} is no longer available`, { seatNo: takenSeat });
    }

    // 6. Compute fare
    const fareRule = await this.prisma.fareRule.findFirst({
      where: {
        busTypeId: trip.busTypeId,
        validFrom: { lte: trip.serviceDate },
        OR: [{ validTo: null }, { validTo: { gte: trip.serviceDate } }],
      },
      orderBy: { validFrom: "desc" },
    });

    if (!fareRule) {
      throw new AppError("VALIDATION_FAILED", "No fare rule found for this trip");
    }

    const distanceKm = droppingStop.kmFromOrigin - boardingStop.kmFromOrigin;
    const singleFare = calculateFare({
      distanceKm,
      rule: {
        baseFarePaise: fareRule.baseFarePaise,
        perKmPaise: fareRule.perKmPaise,
        minFarePaise: fareRule.minFarePaise,
        reservationFeePaise: fareRule.reservationFeePaise,
      },
      isFreeTravel: input.useFreeTravel,
    });
    const totalPaise = singleFare.totalPaise * input.passengers.length;

    // 7. Atomically hold all seats in Redis
    const holdTtlSec = holdMinutes * 60;
    const tempHoldVal = `hold_${userId}_${Date.now()}`;
    const acquiredKeys: string[] = [];

    for (const seatNo of seatNos) {
      const holdKey = `hold:${trip.id}:${seatNo}`;
      let setOk = false;
      try {
        const res = await this.redis.client.set(holdKey, tempHoldVal, "EX", holdTtlSec, "NX");
        setOk = res === "OK";
      } catch (err) {
        this.logger.warn(`Redis seat hold error: ${(err as Error).message}`);
      }

      if (!setOk) {
        // Rollback all acquired holds
        for (const acquiredKey of acquiredKeys) {
          try {
            await this.redis.client.del(acquiredKey);
          } catch {
            // Ignore rollback deletion error
          }
        }
        throw new AppError("SEAT_TAKEN", `Seat ${seatNo} is no longer available`, { seatNo });
      }
      acquiredKeys.push(holdKey);
    }

    // Update holdcount for the trip
    try {
      await this.redis.client.incrby(`holdcount:${trip.id}`, seatNos.length);
      await this.redis.client.expire(`holdcount:${trip.id}`, holdTtlSec + 60);
    } catch {
      // Non-critical metric
    }

    // 8. Create booking in DB
    const holdExpiresAt = new Date(now.getTime() + holdMinutes * 60_000);
    const code = generateBookingCode();

    const booking = await this.prisma.$transaction(async (tx) => {
      const created = await tx.booking.create({
        data: {
          code,
          userId,
          tripId: trip.id,
          boardingStopId: input.boardingStopId,
          droppingStopId: input.droppingStopId,
          status: "PENDING_PAYMENT",
          totalPaise,
          holdExpiresAt,
          passengers: {
            create: input.passengers.map((p) => ({
              name: p.name,
              age: p.age,
              gender: p.gender,
              seatNo: p.seatNo,
            })),
          },
        },
        include: {
          passengers: true,
        },
      });
      return created;
    });

    // Update Redis hold values with real bookingId
    for (const holdKey of acquiredKeys) {
      try {
        await this.redis.client.set(holdKey, booking.id, "KEEPTTL");
      } catch {
        // Ignore key value update error
      }
    }

    // 9. Schedule BullMQ expiry job
    if (this.expiryQueue) {
      try {
        await this.expiryQueue.add(
          "booking-hold-expired",
          { bookingId: booking.id },
          {
            delay: holdMinutes * 60 * 1000,
            jobId: `expiry:${booking.id}`,
            removeOnComplete: true,
            removeOnFail: true,
          },
        );
      } catch (err) {
        this.logger.warn(`Failed to schedule hold expiry job: ${(err as Error).message}`);
      }
    }

    const bookingDto: BookingDto = {
      id: booking.id,
      code: booking.code,
      status: booking.status,
      totalPaise: booking.totalPaise,
      holdExpiresAt: booking.holdExpiresAt.toISOString(),
      tripId: booking.tripId,
      boardingStopId: booking.boardingStopId,
      droppingStopId: booking.droppingStopId,
      passengers: booking.passengers.map((p) => ({
        id: p.id,
        name: p.name,
        age: p.age,
        gender: p.gender,
        seatNo: p.seatNo,
      })),
      createdAt: booking.createdAt.toISOString(),
    };

    // Cache idempotency response for 24h
    if (idempotencyKey) {
      try {
        await this.redis.client.set(
          `idemp:booking:${userId}:${idempotencyKey}`,
          JSON.stringify(bookingDto),
          "EX",
          86_400,
        );
      } catch {
        // Non-critical cache
      }
    }

    return bookingDto;
  }

  /**
   * GET /bookings/:id (owner only)
   */
  async getBooking(userId: string, bookingId: string): Promise<BookingDto> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { passengers: true },
    });

    if (!booking || booking.userId !== userId) {
      throw new AppError("NOT_FOUND", "Booking not found");
    }

    return {
      id: booking.id,
      code: booking.code,
      status: booking.status,
      totalPaise: booking.totalPaise,
      holdExpiresAt: booking.holdExpiresAt.toISOString(),
      tripId: booking.tripId,
      boardingStopId: booking.boardingStopId,
      droppingStopId: booking.droppingStopId,
      passengers: booking.passengers.map((p) => ({
        id: p.id,
        name: p.name,
        age: p.age,
        gender: p.gender,
        seatNo: p.seatNo,
      })),
      createdAt: booking.createdAt.toISOString(),
    };
  }

  /**
   * DELETE /bookings/:id (owner only, only PENDING_PAYMENT)
   * Releases seat holds and marks booking CANCELLED.
   */
  async cancelPendingBooking(userId: string, bookingId: string): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { passengers: true },
    });

    if (!booking || booking.userId !== userId) {
      throw new AppError("NOT_FOUND", "Booking not found");
    }

    if (booking.status !== "PENDING_PAYMENT") {
      throw new AppError("VALIDATION_FAILED", "Only pending bookings can be cancelled");
    }

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: "CANCELLED" },
    });

    // Release seat holds
    await this.releaseSeats(booking.tripId, booking.passengers.map((p) => p.seatNo));
  }

  /**
   * Called by BullMQ expiry processor when hold timer runs out.
   */
  async releaseExpiredHold(bookingId: string): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { passengers: true },
    });

    if (!booking || booking.status !== "PENDING_PAYMENT") {
      return;
    }

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: "EXPIRED" },
    });

    await this.releaseSeats(booking.tripId, booking.passengers.map((p) => p.seatNo));
  }

  private async releaseSeats(tripId: string, seatNos: string[]): Promise<void> {
    if (seatNos.length === 0) return;
    try {
      const keys = seatNos.map((seatNo) => `hold:${tripId}:${seatNo}`);
      await this.redis.client.del(...keys);
      await this.redis.client.decrby(`holdcount:${tripId}`, seatNos.length);
    } catch (err) {
      this.logger.warn(`Failed to release seat holds for trip ${tripId}: ${(err as Error).message}`);
    }
  }

  private async getSettingNumber(key: string): Promise<number | null> {
    try {
      const row = await this.prisma.setting.findUnique({ where: { key }, select: { value: true } });
      return typeof row?.value === "number" ? row.value : null;
    } catch {
      return null;
    }
  }
}
