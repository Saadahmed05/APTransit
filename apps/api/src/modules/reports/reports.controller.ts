import { ReportKind, ReportQuery } from "@aptransit/shared";
import { Controller, Get, Param, Query, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import type { AuthenticatedUser } from "../../common/auth/auth.types";
import { Can } from "../../common/decorators/can.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { AuditService } from "../audit/audit.service";
import { CSV_BOM } from "./csv-helper";
import { ReportsService } from "./reports.service";

@Controller("reports")
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * GET /reports/:kind.csv streams the file. The first line is read before any header goes out,
   * so a scope or range error still answers with the normal JSON error shape.
   */
  @Get(":kind.csv")
  @Can("report:export")
  async exportCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Param("kind", new ZodValidationPipe(ReportKind)) kind: ReportKind,
    @Query(new ZodValidationPipe(ReportQuery)) query: ReportQuery,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const lines = this.reportsService.lines(user, kind, query.from, query.to);
    const first = await lines.next();

    await this.auditService.log({
      action: "report.export",
      entityType: "REPORT",
      entityId: kind,
      actorUserId: user.id,
      actorRole: user.roles[0]?.role ?? null,
      before: null,
      after: { kind, from: query.from, to: query.to },
      ip: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null,
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${kind}-${query.from}-to-${query.to}.csv"`);
    res.setHeader("Cache-Control", "no-store");
    res.write(CSV_BOM);
    if (!first.done) res.write(first.value);
    try {
      for await (const line of lines) {
        // Respect back pressure so a slow download does not buffer the whole file
        if (!res.write(line)) await new Promise((resolve) => res.once("drain", resolve));
      }
    } finally {
      res.end();
    }
  }
}
