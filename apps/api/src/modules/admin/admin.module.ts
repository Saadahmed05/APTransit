import { Module } from "@nestjs/common";
import { NetworkModule } from "../network/network.module";
import { QueueModule } from "../queue/queue.module";
import { TripsModule } from "../trips/trips.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
@Module({
  imports: [TripsModule, NetworkModule, QueueModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
