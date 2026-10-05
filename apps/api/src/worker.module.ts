import { Module } from "@nestjs/common";
import { AppModule } from "./app.module";
import { BookingsModule } from "./modules/bookings/bookings.module";
import { LifecycleModule } from "./modules/lifecycle/lifecycle.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { ExpiryProcessor } from "./modules/queue/processors/expiry.processor";
import { MaintenanceProcessor } from "./modules/queue/processors/maintenance.processor";
import { NotificationsProcessor } from "./modules/queue/processors/notifications.processor";
import { QueueModule } from "./modules/queue/queue.module";
import { TripsModule } from "./modules/trips/trips.module";

@Module({
  imports: [AppModule, QueueModule, BookingsModule, TripsModule, LifecycleModule, NotificationsModule],
  providers: [ExpiryProcessor, MaintenanceProcessor, NotificationsProcessor],
})
export class WorkerModule {}
