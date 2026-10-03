import { EventEmitter } from "node:events";
import { Global, Injectable, Logger, Module } from "@nestjs/common";

/** In process domain events. Listeners (notifications, sockets) subscribe from their modules. */
export interface DomainEvents {
  "booking.confirmed": { bookingId: string; userId: string; tripId: string; ticketIds: string[] };
}

export type DomainEventName = keyof DomainEvents;

@Injectable()
export class DomainEventsService {
  private readonly logger = new Logger(DomainEventsService.name);
  private readonly emitter = new EventEmitter();

  /** Listener errors are logged, never thrown back into the request that published. */
  on<E extends DomainEventName>(event: E, listener: (payload: DomainEvents[E]) => void | Promise<void>): () => void {
    const wrapped = (payload: DomainEvents[E]) => {
      Promise.resolve()
        .then(() => listener(payload))
        .catch((err: unknown) => this.logger.error(`Listener for ${event} failed: ${(err as Error).message}`));
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
