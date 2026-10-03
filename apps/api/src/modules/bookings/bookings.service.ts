import { randomBytes } from "node:crypto";
import {
  type BookingDto,
  calculateFare,
  type CreateBookingInput,
  generateBookingCode,
  SeatLayoutSchema,
} from "@aptransit/shared";
import { Injectable, Logger, Optional } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { AppError } from "../../common/errors/app-error";
import { idempotencySlot, readIdempotent, writeIdempotent } from "../../common/services/idempotency";
import { PrismaService } from "../../prisma/prisma.service";
import { RedisService } from "../../redis/redis.service";
import { SEAT_TAKING_STATUSES } from "../network/network.repository";
import { QUEUES } from "../queue/queue.constants";
import { holdSeats, releaseSeats } from "./seat-holds";

const DEFAULT_MAX_PASSENGERS = 6;
const DEFAULT_DAYS_AHEAD = 30;
const DEFAULT_CLOSE_MINUTES_BEFORE = 10;
const DEFAULT_HOLD_MINUTES = 10;
/** Queue calls must never hold up a booking response. Holds still expire by TTL. */
const QUEUE_ADD_TIMEOUT_MS = 3_000;
const SETTING_KEYS = [
  "booking.maxPassengers",
  "booking.daysAhead",
  "booking.closeMinutesBefore",
  "booking.holdMinutes",
] as const;

/** BullMQ custom job ids cannot contain ":". */
export function expiryJobId(bookingId: string): string {
  return `expiry-${bookingId}`;
}

type BookingWithPassengers = {
  id: string;
  code: string;
  status: BookingDto["status"];
  totalPaise: number;
  holdExpiresAt: Date;
  tripId: string;
  boardingStopId: string;
  droppingStopId: string;
  createdAt: Date;
  passengers: { id: string; name: string; age: number; gender: string; seatNo: string }[];
};

function toBookingDto(booking: BookingWithPassengers): BookingDto {
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

async function withTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("queue call timed out")), QUEUE_ADD_TIMEOUT_MS);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Booking ids are made here so the Redis hold can carry the id before the row exists. */
function newBookingId(): string {
  return `c${randomBytes(12).toString("hex")}`;
}

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Optional() @InjectQueue(QUEUES.EXPIRY) private readonly expiryQueue?: Queue,
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
    // 1. Idempotency: same key and body returns the first result (docs/06)
    const slot = idempotencySlot("booking", userId, idempotencyKey, input);
    const cached = await readIdempotent<BookingDto>(this.redis.client, slot);
    if (cached) return cached;

    // Free travel needs an active FREE_TRAVEL pass checked on the server (docs/06, Day 8).
    // Never take the client's word for eligibility.
    if (input.useFreeTravel) {
      throw new AppError("ELIGIBILITY_REQUIRED", "Free travel needs an active free travel pass");
    }

    // 2. Validate settings
    const settings = await this.getSettingNumbers();
    const maxPassengers = settings.get("booking.maxPassengers") ?? DEFAULT_MAX_PASSENGERS;
    const daysAhead = settings.get("booking.daysAhead") ?? DEFAULT_DAYS_AHEAD;
    const closeMinutesBefore = settings.get("booking.closeMinutesBefore") ?? DEFAULT_CLOSE_MINUTES_BEFORE;
    const holdMinutes = settings.get("booking.holdMinutes") ?? DEFAULT_HOLD_MINUTES;

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
    if (trip.status === "COMPLETED") {
      throw new AppError("VALIDATION_FAILED", "Booking is closed for this trip");
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

    // 6. Compute fare on the server, never from the client
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
    });
    const totalPaise = singleFare.totalPaise * input.passengers.length;

    // 7. Hold all seats in one atomic Redis command. A hold we cannot place is never assumed free.
    const bookingId = newBookingId();
    const holdTtlSec = holdMinutes * 60;
    let takenSeat: string | null;
    try {
      takenSeat = await holdSeats(this.redis.client, trip.id, seatNos, bookingId, holdTtlSec);
    } catch (err) {
      this.logger.warn(`Redis seat hold error: ${(err as Error).message}`);
      throw new AppError("INTERNAL", "Could not hold seats, please try again");
    }
    if (takenSeat) {
      throw new AppError("SEAT_TAKEN", `Seat ${takenSeat} is no longer available`, { seatNo: takenSeat });
    }

    // 8. Create booking and passengers in one transaction. On failure give the seats back.
    const holdExpiresAt = new Date(now.getTime() + holdTtlSec * 1000);
    let booking: BookingWithPassengers;
    try {
      booking = await this.prisma.$transaction((tx) =>
        tx.booking.create({
          data: {
            id: bookingId,
            code: generateBookingCode(),
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
          include: { passengers: true },
        }),
      );
    } catch (err) {
      await this.release(trip.id, seatNos, bookingId);
      throw err;
    }

    // 9. Schedule BullMQ expiry job at holdExpiresAt
    if (this.expiryQueue) {
      try {
        await withTimeout(
          this.expiryQueue.add(
            "booking-hold-expired",
            { bookingId: booking.id },
            {
              delay: Math.max(0, holdExpiresAt.getTime() - Date.now()),
              jobId: expiryJobId(booking.id),
              removeOnComplete: true,
              removeOnFail: true,
            },
          ),
        );
      } catch (err) {
        this.logger.warn(`Failed to schedule hold expiry job for ${booking.id}: ${(err as Error).message}`);
      }
    }

    const bookingDto = toBookingDto(booking);
    await writeIdempotent(this.redis.client, slot, bookingDto);
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

    return toBookingDto(booking);
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

    // Conditional update: a payment or the expiry job may change the status at the same time.
    const { count } = await this.prisma.booking.updateMany({
      where: { id: bookingId, status: "PENDING_PAYMENT" },
      data: { status: "CANCELLED" },
    });
    if (count === 0) {
      throw new AppError("VALIDATION_FAILED", "Only pending bookings can be cancelled");
    }

    await this.release(booking.tripId, booking.passengers.map((p) => p.seatNo), booking.id);
    await this.removeExpiryJob(booking.id);
  }

  /**
   * Called by BullMQ expiry processor when hold timer runs out.
   */
  async releaseExpiredHold(bookingId: string, now = new Date()): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { passengers: true },
    });

    if (!booking || booking.status !== "PENDING_PAYMENT" || booking.holdExpiresAt.getTime() > now.getTime()) {
      return;
    }

    const { count } = await this.prisma.booking.updateMany({
      where: { id: bookingId, status: "PENDING_PAYMENT" },
      data: { status: "EXPIRED" },
    });
    if (count === 0) return;

    await this.release(booking.tripId, booking.passengers.map((p) => p.seatNo), booking.id);
  }

  private async release(tripId: string, seatNos: string[], bookingId: string): Promise<void> {
    try {
      await releaseSeats(this.redis.client, tripId, seatNos, bookingId);
    } catch (err) {
      // Holds still expire on their own TTL.
      this.logger.warn(`Failed to release seat holds for trip ${tripId}: ${(err as Error).message}`);
    }
  }

  private async removeExpiryJob(bookingId: string): Promise<void> {
    if (!this.expiryQueue) return;
    try {
      await withTimeout(this.expiryQueue.remove(expiryJobId(bookingId)));
    } catch {
      // The job is a no-op for a cancelled booking anyway
    }
  }

  private async getSettingNumbers(): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    try {
      const rows = await this.prisma.setting.findMany({
        where: { key: { in: [...SETTING_KEYS] } },
        select: { key: true, value: true },
      });
      for (const row of rows) {
        if (typeof row.value === "number") map.set(row.key, row.value);
      }
    } catch {
      // Defaults apply
    }
    return map;
  }
}
