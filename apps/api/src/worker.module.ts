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

import { RollupsModule } from "./modules/rollups/rollups.module";
import { RollupsProcessor } from "./modules/queue/processors/rollups.processor";

@Module({
  imports: [AppModule, QueueModule, BookingsModule, TripsModule, LifecycleModule, NotificationsModule, RollupsModule],
  providers: [ExpiryProcessor, MaintenanceProcessor, NotificationsProcessor, RollupsProcessor],
})
export class WorkerModule {}
