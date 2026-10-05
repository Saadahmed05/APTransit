import { maskEmail, maskPhone } from "@aptransit/shared";
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationsService } from "./notifications.service";

const MS_PER_MIN = 60_000;

/**
 * Domain events to notifications (docs/13 trigger list, Day 9 scope). Only docs/05 types:
 * booking.confirmed to BOOKING_CONFIRMED (one per booking), ticket ACTIVE to TICKET_ACTIVATED,
 * ticket.transferred to TICKET_RECEIVED for the recipient. Refunds have no type in the MVP.
 */
@Injectable()
export class NotificationsSubscriber implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsSubscriber.name);
  private readonly off: (() => void)[] = [];

  constructor(
    private readonly events: DomainEventsService,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.off.push(
      this.events.on("booking.confirmed", (e) => this.bookingConfirmed(e.bookingId, e.ticketIds)),
      this.events.on("ticket.status", async (e) => {
        if (e.to === "ACTIVE") await this.notifications.notify(e.holderUserId, "TICKET_ACTIVATED", {}, `/tickets/${e.ticketId}`);
      }),
      this.events.on("ticket.transferred", (e) => this.ticketReceived(e.ticketId, e.fromUserId, e.toUserId)),
    );
  }

  onModuleDestroy(): void {
    this.off.forEach((unsubscribe) => unsubscribe());
  }

  private async bookingConfirmed(bookingId: string, ticketIds: string[]): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        passengers: { select: { seatNo: true }, orderBy: { seatNo: "asc" } },
        trip: { include: { route: { include: { routeStops: { select: { stopId: true, minutesFromOrigin: true } } } } } },
      },
    });
    if (!booking) {
      this.logger.warn(`booking.confirmed for unknown booking ${bookingId}`);
      return;
    }
    const minutes = booking.trip.route.routeStops.find((rs) => rs.stopId === booking.boardingStopId)?.minutesFromOrigin ?? 0;
    await this.notifications.notify(
      booking.userId,
      "BOOKING_CONFIRMED",
      {
        routeEn: booking.trip.route.nameEn,
        routeTe: booking.trip.route.nameTe,
        departureAt: new Date(booking.trip.scheduledDepartureAt.getTime() + minutes * MS_PER_MIN).toISOString(),
        seat: booking.passengers.map((p) => p.seatNo).join(", "),
      },
      ticketIds.length === 1 ? `/tickets/${ticketIds[0]}` : "/tickets",
    );
  }

  private async ticketReceived(ticketId: string, fromUserId: string, toUserId: string): Promise<void> {
    const [ticket, sender] = await Promise.all([
      this.prisma.ticket.findUnique({ where: { id: ticketId }, include: { route: { select: { nameEn: true, nameTe: true } } } }),
      this.prisma.user.findUnique({ where: { id: fromUserId }, select: { name: true, phone: true, email: true } }),
    ]);
    if (!ticket) return;
    // Never the sender's full phone or email (docs/12)
    const senderName = sender?.name?.trim() || (sender?.phone ? maskPhone(sender.phone) : sender?.email ? maskEmail(sender.email) : "");
    await this.notifications.notify(
      toUserId,
      "TICKET_RECEIVED",
      { sender: senderName, routeEn: ticket.route.nameEn, routeTe: ticket.route.nameTe },
      `/tickets/${ticketId}`,
    );
  }
}
