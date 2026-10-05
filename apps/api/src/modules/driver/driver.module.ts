import { Module } from "@nestjs/common";
import { TrackingModule } from "../tracking/tracking.module";
import { DriverController } from "./driver.controller";
import { DriverService } from "./driver.service";

@Module({
  imports: [TrackingModule],
  controllers: [DriverController],
  providers: [DriverService],
  exports: [DriverService],
})
export class DriverModule {}
