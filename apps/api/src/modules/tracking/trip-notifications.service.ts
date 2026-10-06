import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { delayNotificationBand, etaSecondsTo } from "./progress";
import type { TripContext } from "./trip-context.service";

@Injectable()
export class TripNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}
  async update(
    context: TripContext,
    delay: number,
    lastStopSeq: number | null,
    now: Date,
    departed = false,
  ): Promise<void> {
    const tickets = await this.prisma.ticket.findMany({
      where: { tripId: context.trip.id, status: { in: ["BOOKED", "ACTIVE"] } },
      select: { id: true, holderUserId: true, boardingStopId: true },
    });
    const reached = context.stops.find((s) => s.seq === lastStopSeq) ?? null;
    const band = delayNotificationBand(delay);
    for (const ticket of tickets) {
      const link = `/track/${context.trip.id}`;
      if (departed)
        await this.notifications.notify(
          ticket.holderUserId,
          "TRIP_DEPARTED",
          {
            routeEn: context.route.nameEn,
            routeTe: context.route.nameTe,
            stopEn: context.stops[0]?.nameEn ?? "",
            stopTe: context.stops[0]?.nameTe ?? "",
            departureAt: now.toISOString(),
          },
          link,
          `departed:${context.trip.id}`,
        );
      if (band !== null)
        await this.notifications.notify(
          ticket.holderUserId,
          "TRIP_DELAYED",
          {
            minutes: delay,
            departureAt: new Date(
              context.trip.scheduledArrivalAt.getTime() + delay * 60_000,
            ).toISOString(),
          },
          link,
          `delay:${context.trip.id}:${band}`,
        );
      const stop = context.stops.find((s) => s.stopId === ticket.boardingStopId);
      if (!departed && stop && (!reached || stop.seq >= reached.seq)) {
        const seconds = etaSecondsTo(
          stop,
          reached,
          context.trip.scheduledDepartureAt,
          now,
          context.trip.actualDepartureAt,
        );
        if (seconds <= 600)
          await this.notifications.notify(
            ticket.holderUserId,
            "BUS_NEAR_STOP",
            { stopEn: stop.nameEn, stopTe: stop.nameTe, minutes: Math.ceil(seconds / 60) },
            link,
            `near:${ticket.id}`,
          );
      }
    }
  }
}
