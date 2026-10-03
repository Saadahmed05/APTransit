import { Module } from "@nestjs/common";
import { AppModule } from "./app.module";
import { BookingsModule } from "./modules/bookings/bookings.module";
import { ExpiryProcessor } from "./modules/queue/processors/expiry.processor";
import { MaintenanceProcessor } from "./modules/queue/processors/maintenance.processor";
import { QueueModule } from "./modules/queue/queue.module";
import { TripsModule } from "./modules/trips/trips.module";

@Module({
  imports: [AppModule, QueueModule, BookingsModule, TripsModule],
  providers: [ExpiryProcessor, MaintenanceProcessor],
})
export class WorkerModule {}
