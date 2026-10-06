import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LiveGateway } from "./live.gateway";
import { TrackingController } from "./tracking.controller";
import { TrackingService } from "./tracking.service";
import { TripContextService } from "./trip-context.service";
import { TripNotificationsService } from "./trip-notifications.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { OpsModule } from "../ops/ops.module";

@Module({
  imports: [AuthModule, NotificationsModule, OpsModule],
  controllers: [TrackingController],
  providers: [TripContextService, TrackingService, LiveGateway, TripNotificationsService],
  exports: [TripContextService, TrackingService, TripNotificationsService],
})
export class TrackingModule {}
