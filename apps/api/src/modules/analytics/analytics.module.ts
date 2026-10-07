import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { RollupsModule } from "../rollups/rollups.module";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsService } from "./analytics.service";

@Module({
  imports: [PrismaModule, RollupsModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
