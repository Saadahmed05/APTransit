import { randomBytes } from "node:crypto";
import { generateTicketCode } from "@aptransit/shared";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { sealSecret } from "../../common/crypto/secret-box";
import { DomainEventsService } from "../../common/events/domain-events.service";
import type { Env } from "../../config/env";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { RedisService } from "../../redis/redis.service";
import { AuditService } from "../audit/audit.service";
import { holdKey, releaseSeats } from "../bookings/seat-holds";
import { SEAT_TAKING_STATUSES } from "../network/network.repository";
import { activationClosesAt, TICKET_SETTING_DEFAULTS } from "../tickets/ticket-rules";
import { PAYMENT_PROVIDER, type PaymentProvider, type ProviderPayment, redactPaymentPayload } from "./payment-provider";

export type ConfirmResult =
  | { outcome: "CONFIRMED"; bookingId: string; ticketIds: string[] }
  | { outcome: "REFUNDED"; bookingId: string };

const REFUND_REASON_LATE = "LATE_PAYMENT_SEATS_UNAVAILABLE";
const REFUND_REASON_DUPLICATE = "DUPLICATE_PAYMENT";

/** Thrown inside the transaction when the seats went to someone else after the checks. */
class SeatsGone extends Error {}

/**
 * The only code that turns a paid booking into tickets (docs/06: tickets only after the HMAC and
 * amount checks). Idempotent: verify and the webhook can both call it, in any order, any number of
 * times. Moving the payment row out of CREATED or FAILED is the claim; whoever wins it does the work.
 */
@Injectable()
export class BookingConfirmationService {
  private readonly logger = new Logger(BookingConfirmationService.name);
  private readonly qrSecretKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly events: DomainEventsService,
    private readonly audit: AuditService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    config: ConfigService<Env, true>,
  ) {
    this.qrSecretKey = config.get("QR_SECRET_KEY", { infer: true });
  }

  /**
   * @param paymentRowId our payments.id
   * @param providerPayment the captured provider payment, already checked for order id and amount
   */
  async confirmBooking(paymentRowId: string, providerPayment: ProviderPayment, now = new Date()): Promise<ConfirmResult> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentRowId },
      include: {
        refunds: { select: { id: true } },
        booking: {
          include: {
            passengers: { orderBy: { seatNo: "asc" } },
            trip: {
              include: {
                route: { include: { routeStops: { select: { stopId: true, minutesFromOrigin: true } } } },
              },
            },
          },
        },
      },
    });
    if (!payment?.booking) {
      throw new Error(`confirmBooking: payment ${paymentRowId} has no booking`);
    }
    const booking = payment.booking;

    // Already handled by an earlier call
    if (payment.status !== "CREATED" && payment.status !== "FAILED") {
      return this.existingResult(booking.id, payment.refunds.length > 0);
    }

    const seatNos = booking.passengers.map((p) => p.seatNo);
    const paidTwice = booking.status === "CONFIRMED";
    const seatsOk = !paidTwice && (await this.seatsStillOurs(booking, seatNos));

    if (!seatsOk) {
      return this.refundUnusable(payment.id, booking.id, providerPayment, paidTwice ? REFUND_REASON_DUPLICATE : REFUND_REASON_LATE);
    }

    const closesMinutes = await this.settingNumber("activation.closesMinutesAfter");
    const boarding = booking.trip.route.routeStops.find((rs) => rs.stopId === booking.boardingStopId);
    const expiresAt = activationClosesAt(
      {
        boardingDepartureAt: new Date(booking.trip.scheduledDepartureAt.getTime() + (boarding?.minutesFromOrigin ?? 0) * 60_000),
        delayMinutes: booking.trip.delayMinutes,
      },
      closesMinutes,
    );
    const perPassenger = Math.floor(booking.totalPaise / booking.passengers.length);
    const remainder = booking.totalPaise - perPassenger * booking.passengers.length;

    let ticketIds: string[];
    try {
      ticketIds = await this.prisma.$transaction(async (tx) => {
        if (!(await this.claimPayment(tx, payment.id, providerPayment, now))) return [];

        const confirmed = await tx.booking.updateMany({
          where: { id: booking.id, status: { in: ["PENDING_PAYMENT", "EXPIRED"] } },
          data: { status: "CONFIRMED" },
        });
        const clash = await tx.ticket.count({
          where: { tripId: booking.tripId, seatNo: { in: seatNos }, status: { in: [...SEAT_TAKING_STATUSES] } },
        });
        if (confirmed.count !== 1 || clash > 0) throw new SeatsGone();

        const ids: string[] = [];
        for (const [index, passenger] of booking.passengers.entries()) {
          const ticket = await tx.ticket.create({
            data: {
              code: generateTicketCode(),
              bookingId: booking.id,
              passengerId: passenger.id,
              type: "SINGLE",
              status: "BOOKED",
              holderUserId: booking.userId,
              originalUserId: booking.userId,
              tripId: booking.tripId,
              routeId: booking.trip.routeId,
              boardingStopId: booking.boardingStopId,
              droppingStopId: booking.droppingStopId,
              seatNo: passenger.seatNo,
              farePaise: perPassenger + (index === 0 ? remainder : 0),
              expiresAt,
              qrSecret: sealSecret(randomBytes(32), this.qrSecretKey),
              giftable: true,
            },
            select: { id: true },
          });
          ids.push(ticket.id);
        }
        return ids;
      });
    } catch (err) {
      if (err instanceof SeatsGone) {
        return this.refundUnusable(payment.id, booking.id, providerPayment, REFUND_REASON_LATE);
      }
      throw err;
    }

    // Lost the claim to a concurrent call: report what it did
    if (ticketIds.length === 0) return this.existingResult(booking.id, false);

    await this.releaseHolds(booking.tripId, seatNos, booking.id);
    this.events.publish("booking.confirmed", {
      bookingId: booking.id,
      userId: booking.userId,
      tripId: booking.tripId,
      ticketIds,
    });
    return { outcome: "CONFIRMED", bookingId: booking.id, ticketIds };
  }

  /**
   * Free travel (docs/07 section 9): a held, zero fare booking becomes CONFIRMED with one
   * FREE_TRAVEL ticket (farePaise 0, never giftable) without any payment. The caller has already
   * checked the active FREE_TRAVEL pass and the service type. Null when the seat went elsewhere.
   */
  async confirmFreeTravel(bookingId: string): Promise<{ bookingId: string; ticketIds: string[] } | null> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        passengers: { orderBy: { seatNo: "asc" } },
        trip: { include: { route: { include: { routeStops: { select: { stopId: true, minutesFromOrigin: true } } } } } },
      },
    });
    if (!booking || booking.totalPaise !== 0 || booking.passengers.length !== 1) {
      throw new Error(`confirmFreeTravel: booking ${bookingId} is not a free travel booking`);
    }
    const passenger = booking.passengers[0]!;
    const closesMinutes = await this.settingNumber("activation.closesMinutesAfter");
    const boarding = booking.trip.route.routeStops.find((rs) => rs.stopId === booking.boardingStopId);
    const expiresAt = activationClosesAt(
      {
        boardingDepartureAt: new Date(booking.trip.scheduledDepartureAt.getTime() + (boarding?.minutesFromOrigin ?? 0) * 60_000),
        delayMinutes: booking.trip.delayMinutes,
      },
      closesMinutes,
    );

    let ticketId: string;
    try {
      ticketId = await this.prisma.$transaction(async (tx) => {
        const confirmed = await tx.booking.updateMany({ where: { id: booking.id, status: "PENDING_PAYMENT" }, data: { status: "CONFIRMED" } });
        const clash = await tx.ticket.count({
          where: { tripId: booking.tripId, seatNo: passenger.seatNo, status: { in: [...SEAT_TAKING_STATUSES] } },
        });
        if (confirmed.count !== 1 || clash > 0) throw new SeatsGone();
        const ticket = await tx.ticket.create({
          data: {
            code: generateTicketCode(),
            bookingId: booking.id,
            passengerId: passenger.id,
            type: "FREE_TRAVEL",
            status: "BOOKED",
            holderUserId: booking.userId,
            originalUserId: booking.userId,
            tripId: booking.tripId,
            routeId: booking.trip.routeId,
            boardingStopId: booking.boardingStopId,
            droppingStopId: booking.droppingStopId,
            seatNo: passenger.seatNo,
            farePaise: 0,
            expiresAt,
            qrSecret: sealSecret(randomBytes(32), this.qrSecretKey),
            giftable: false,
          },
          select: { id: true },
        });
        return ticket.id;
      });
    } catch (err) {
      if (err instanceof SeatsGone) {
        await this.prisma.booking.updateMany({ where: { id: booking.id, status: "PENDING_PAYMENT" }, data: { status: "CANCELLED" } });
        await this.releaseHolds(booking.tripId, [passenger.seatNo], booking.id);
        return null;
      }
      throw err;
    }

    await this.releaseHolds(booking.tripId, [passenger.seatNo], booking.id);
    this.events.publish("booking.confirmed", { bookingId: booking.id, userId: booking.userId, tripId: booking.tripId, ticketIds: [ticketId] });
    return { bookingId: booking.id, ticketIds: [ticketId] };
  }

  /**
   * Money arrived but the seats cannot be given: the hold expired and the seats went to someone
   * else, the booking was cancelled, or the booking was already paid. Full refund, no tickets.
   */
  private async refundUnusable(
    paymentRowId: string,
    bookingId: string,
    providerPayment: ProviderPayment,
    reason: string,
  ): Promise<ConfirmResult> {
    const claimed = await this.prisma.$transaction(async (tx) => {
      if (!(await this.claimPayment(tx, paymentRowId, providerPayment, new Date()))) return false;
      await tx.booking.updateMany({
        where: { id: bookingId, status: { in: ["PENDING_PAYMENT", "EXPIRED"] } },
        data: { status: "EXPIRED" },
      });
      return true;
    });
    if (!claimed) return this.existingResult(bookingId, true);

    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, include: { passengers: true } });
    if (booking) await this.releaseHolds(booking.tripId, booking.passengers.map((p) => p.seatNo), booking.id);

    const policy =
      (await this.prisma.refundPolicy.findFirst({ where: { validFrom: { lte: new Date() } }, orderBy: { validFrom: "desc" } })) ??
      (await this.prisma.refundPolicy.findFirst({ where: { validFrom: { lte: new Date() } }, orderBy: { validFrom: "desc" } }));

    let providerRefund: { id: string; status: string } | null = null;
    try {
      providerRefund = await this.provider.createRefund({
        paymentId: providerPayment.id,
        amountPaise: providerPayment.amountPaise,
        notes: { bookingId, reason },
      });
    } catch (err) {
      this.logger.error(`Refund for payment ${paymentRowId} failed, needs an operator: ${(err as Error).message}`);
    }

    if (policy) {
      const refund = await this.prisma.refund.create({
        data: {
          paymentId: paymentRowId,
          amountPaise: providerPayment.amountPaise,
          status: providerRefund ? (providerRefund.status === "processed" ? "PROCESSED" : "PENDING") : "FAILED",
          providerRefundId: providerRefund?.id ?? null,
          processedAt: providerRefund?.status === "processed" ? new Date() : null,
          policyId: policy.id,
          reason,
        },
      });
      await this.audit.log({
        action: "refund.create",
        entityType: "refund",
        entityId: refund.id,
        after: { paymentId: paymentRowId, bookingId, amountPaise: providerPayment.amountPaise, reason, status: refund.status },
      });
    } else {
      this.logger.error(`No refund policy, refund row for payment ${paymentRowId} not written`);
    }

    return { outcome: "REFUNDED", bookingId };
  }

  /** Moves the payment out of CREATED or FAILED. False when another call already did. */
  private async claimPayment(
    tx: Prisma.TransactionClient,
    paymentRowId: string,
    providerPayment: ProviderPayment,
    now: Date,
  ): Promise<boolean> {
    const { count } = await tx.payment.updateMany({
      where: { id: paymentRowId, status: { in: ["CREATED", "FAILED"] } },
      data: {
        status: "CAPTURED",
        providerPaymentId: providerPayment.id,
        capturedAt: now,
        raw: redactPaymentPayload(providerPayment.raw) as Prisma.InputJsonValue,
      },
    });
    return count === 1;
  }

  private async existingResult(bookingId: string, refunded: boolean): Promise<ConfirmResult> {
    const tickets = await this.prisma.ticket.findMany({
      where: { bookingId },
      select: { id: true },
      orderBy: { seatNo: "asc" },
    });
    if (!refunded && tickets.length > 0) {
      return { outcome: "CONFIRMED", bookingId, ticketIds: tickets.map((t) => t.id) };
    }
    return { outcome: "REFUNDED", bookingId };
  }

  /**
   * The seats are still ours when the booking can still be confirmed, no ticket took them, and no
   * other booking holds them. A late payment with free seats is still honoured.
   */
  private async seatsStillOurs(
    booking: { id: string; status: string; tripId: string; trip: { status: string } },
    seatNos: string[],
  ): Promise<boolean> {
    if (booking.status !== "PENDING_PAYMENT" && booking.status !== "EXPIRED") return false;
    if (booking.trip.status === "CANCELLED" || booking.trip.status === "COMPLETED") return false;

    const taken = await this.prisma.ticket.count({
      where: { tripId: booking.tripId, seatNo: { in: seatNos }, status: { in: [...SEAT_TAKING_STATUSES] } },
    });
    if (taken > 0) return false;

    try {
      const holders = await this.redis.client.mget(seatNos.map((seatNo) => holdKey(booking.tripId, seatNo)));
      return holders.every((holder) => holder === null || holder === booking.id);
    } catch {
      // Redis down: the ticket check above and the transaction still guard the seats
      return true;
    }
  }

  private async releaseHolds(tripId: string, seatNos: string[], bookingId: string): Promise<void> {
    try {
      await releaseSeats(this.redis.client, tripId, seatNos, bookingId);
    } catch (err) {
      this.logger.warn(`Failed to release seat holds for booking ${bookingId}: ${(err as Error).message}`);
    }
  }

  private async settingNumber(key: keyof typeof TICKET_SETTING_DEFAULTS): Promise<number> {
    try {
      const row = await this.prisma.setting.findUnique({ where: { key }, select: { value: true } });
      return typeof row?.value === "number" ? row.value : TICKET_SETTING_DEFAULTS[key];
    } catch {
      return TICKET_SETTING_DEFAULTS[key];
    }
  }
}
