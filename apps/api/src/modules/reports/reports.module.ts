import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { AnalyticsModule } from "../analytics/analytics.module";
import { AuditModule } from "../audit/audit.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  imports: [PrismaModule, AuditModule, AnalyticsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
