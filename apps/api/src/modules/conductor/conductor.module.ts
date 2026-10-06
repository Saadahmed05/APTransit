import { Module } from "@nestjs/common";
import { TicketsModule } from "../tickets/tickets.module";
import { ConductorController, ValidateController } from "./conductor.controller";
import { ConductorService } from "./conductor.service";
import { ValidateService } from "./validate.service";
@Module({
  imports: [TicketsModule],
  controllers: [ConductorController, ValidateController],
  providers: [ConductorService, ValidateService],
})
export class ConductorModule {}
