import { ReportKind, ReportQuery } from "@aptransit/shared";
import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import type { AuthenticatedUser } from "../../common/auth/auth.types";
import { Can } from "../../common/decorators/can.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { AuditService } from "../audit/audit.service";
import { ReportsService } from "./reports.service";

@Controller("reports")
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly auditService: AuditService,
  ) {}

  @Get(":kind.csv")
  @Can("report:export")
  async exportCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Param("kind", new ZodValidationPipe(ReportKind)) kind: string,
    @Query(new ZodValidationPipe(ReportQuery)) query: ReportQuery,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const csvContent = await this.reportsService.generateReport(
      kind,
      query.from,
      query.to,
    );

    // Audit report export
    await this.auditService.log({
      action: "report.export",
      entityType: "REPORT",
      entityId: kind,
      actorUserId: user.id,
      actorRole: user.roles[0]?.role ?? null,
      before: { from: query.from, to: query.to },
      after: { kind, size: csvContent.length },
      ip: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null,
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${kind}-${query.from}-to-${query.to}.csv"`,
    );
    res.send(csvContent);
  }
}
