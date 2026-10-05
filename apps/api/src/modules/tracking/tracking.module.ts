import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LiveGateway } from "./live.gateway";
import { TrackingController } from "./tracking.controller";
import { TrackingService } from "./tracking.service";
import { TripContextService } from "./trip-context.service";

@Module({
  imports: [AuthModule],
  controllers: [TrackingController],
  providers: [TripContextService, TrackingService, LiveGateway],
  exports: [TripContextService, TrackingService],
})
export class TrackingModule {}
