import { Module } from "@nestjs/common";
import { TicketsModule } from "../tickets/tickets.module";
import { TrackingModule } from "../tracking/tracking.module";
import { DriverModule } from "../driver/driver.module";
import { ConductorController, ConductorSosController, ValidateController } from "./conductor.controller";
import { ConductorService } from "./conductor.service";
import { ValidateService } from "./validate.service";
@Module({
  imports: [TicketsModule, TrackingModule, DriverModule],
  controllers: [ConductorController, ConductorSosController, ValidateController],
  providers: [ConductorService, ValidateService],
})
export class ConductorModule {}
