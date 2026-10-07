import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { TrackingModule } from "../tracking/tracking.module";
import { GovController } from "./gov.controller";
import { GovService } from "./gov.service";

@Module({
  imports: [PrismaModule, AuthModule, TrackingModule],
  controllers: [GovController],
  providers: [GovService],
  exports: [GovService],
})
export class GovModule {}
