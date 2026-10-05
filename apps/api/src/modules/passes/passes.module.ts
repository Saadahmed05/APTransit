import { Module } from "@nestjs/common";
import { EligibilityModule } from "../eligibility/eligibility.module";
import { TicketsModule } from "../tickets/tickets.module";
import { PassesController, PassTypesController } from "./passes.controller";
import { PassesService } from "./passes.service";

@Module({
  imports: [EligibilityModule, TicketsModule],
  controllers: [PassTypesController, PassesController],
  providers: [PassesService],
  exports: [PassesService],
})
export class PassesModule {}
