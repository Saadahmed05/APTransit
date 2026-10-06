import { EventEmitter } from "node:events";
import type {
  BusPositionEvent,
  IncidentDto,
  NotificationDto,
  TicketStatus,
  TripStatusEvent,
} from "@aptransit/shared";
import { Global, Injectable, Logger, Module } from "@nestjs/common";

/** In process domain events. Listeners (notifications, sockets) subscribe from their modules. */
export interface DomainEvents {
  "notification.created": { userId: string; notification: NotificationDto };
  "booking.confirmed": { bookingId: string; userId: string; tripId: string; ticketIds: string[] };
  /** Every ticket status change (docs/07 section 2). Sockets emit ticket:status from this on Day 12. */
  "ticket.status": { ticketId: string; holderUserId: string; from: TicketStatus; to: TicketStatus };
  /** A gift moved the ticket to another holder (docs/07 section 7). */
  "ticket.transferred": {
    ticketId: string;
    fromUserId: string;
    toUserId: string;
    seatNo: string | null;
  };
  /** Day 11: a trip started or ended. `rooms` are the socket rooms that should hear it. */
  "trip.status": TripStatusEvent & { rooms: LiveRooms };
  /** Day 11: an accepted GPS ping produced a new live position. */
  "bus.position": BusPositionEvent & { rooms: LiveRooms };
  /** Day 11: a driver reported an incident. */
  "incident.created": IncidentDto & { rooms: LiveRooms };
  "incident.updated": IncidentDto & { rooms: LiveRooms };
  "trip.bus_replaced": { tripId: string; busId: string; driverId: string };
  "conductor.scan": { tripId: string };
}

/** Where a trip's live events go (docs/13 Socket rooms). */
export interface LiveRooms {
  tripId: string;
  routeId: string;
  depotId: string;
  districtId: string;
}

export type DomainEventName = keyof DomainEvents;

@Injectable()
export class DomainEventsService {
  private readonly logger = new Logger(DomainEventsService.name);
  private readonly emitter = new EventEmitter();

  /** Listener errors are logged, never thrown back into the request that published. */
  on<E extends DomainEventName>(
    event: E,
    listener: (payload: DomainEvents[E]) => void | Promise<void>,
  ): () => void {
    const wrapped = (payload: DomainEvents[E]) => {
      Promise.resolve()
        .then(() => listener(payload))
        .catch((err: unknown) =>
          this.logger.error(`Listener for ${event} failed: ${(err as Error).message}`),
        );
    };
    this.emitter.on(event, wrapped);
    return () => this.emitter.off(event, wrapped);
  }

  publish<E extends DomainEventName>(event: E, payload: DomainEvents[E]): void {
    this.emitter.emit(event, payload);
  }
}

@Global()
@Module({
  providers: [DomainEventsService],
  exports: [DomainEventsService],
})
export class DomainEventsModule {}
