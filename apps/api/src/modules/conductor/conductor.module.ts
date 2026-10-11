import { Module } from "@nestjs/common";
import { TicketsModule } from "../tickets/tickets.module";
import { TrackingModule } from "../tracking/tracking.module";
import { ConductorController, ValidateController } from "./conductor.controller";
import { ConductorService } from "./conductor.service";
import { ValidateService } from "./validate.service";
@Module({
  imports: [TicketsModule, TrackingModule],
  controllers: [ConductorController, ValidateController],
  providers: [ConductorService, ValidateService],
})
export class ConductorModule {}
