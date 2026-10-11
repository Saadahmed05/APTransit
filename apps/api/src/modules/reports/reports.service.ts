import { formatIstDate, formatIstTime, type ReportKind } from "@aptransit/shared";
import { Injectable } from "@nestjs/common";
import type { AuthenticatedUser } from "../../common/auth/auth.types";
import { PrismaService } from "../../prisma/prisma.service";
import { type AnalyticsScope, AnalyticsService, complaintScopeOf } from "../analytics/analytics.service";
import { csvLine, rupees } from "./csv-helper";

const PAGE = 2000;

/** IST date and time in one field, for timestamps in reports. */
const istStamp = (d: Date | null) => (d ? `${formatIstDate(d)} ${formatIstTime(d)}` : "");

/**
 * CSV reports (docs/06 GET /reports/:kind.csv, plan sec 72). Lines are yielded as they are read,
 * in pages, so a long range never sits in memory as one string. Every report follows the caller's
 * report:export scope: a depot manager gets their depot, a district officer their district.
 * Dates are ISO (YYYY-MM-DD), times are IST, money is rupees with two decimals.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
  ) {}

  async *lines(user: AuthenticatedUser, kind: ReportKind, from: string, to: string): AsyncGenerator<string> {
    const range = this.analytics.range(from, to);
    const scope = await this.analytics.scopeFor(user, "report:export");
    switch (kind) {
      case "daily-operations":
        yield* this.dailyOperations(scope, range.fromDate, range.toDate, from, to);
        return;
      case "route-performance":
        yield* this.routePerformance(scope, range);
        return;
      case "complaints":
        yield* this.complaints(scope, range.start, range.end);
        return;
      case "tickets":
        yield* this.tickets(scope, range.fromDate, range.toDate);
        return;
    }
  }

  /** One line per date and depot from the rollups (today is computed live). */
  private async *dailyOperations(
    scope: AnalyticsScope,
    fromDate: Date,
    toDate: Date,
    from: string,
    to: string,
  ): AsyncGenerator<string> {
    yield csvLine([
      "Date", "District", "Depot", "Trips scheduled", "Trips completed", "Trips cancelled", "On time %",
      "Average delay (min)", "Passengers", "Tickets sold", "Revenue (INR)", "Incidents", "Complaints",
    ]);
    const [rows, depots] = await Promise.all([
      this.analytics.statsRows(this.analytics.range(from, to)),
      this.prisma.depot.findMany({ select: { id: true, nameEn: true, district: { select: { nameEn: true } } } }),
    ]);
    const depotById = new Map(depots.map((d) => [d.id, d]));
    const lines = rows
      .filter((r) => !r.routeId && r.depotId && scope.depotIds.includes(r.depotId) && r.date >= fromDate && r.date <= toDate)
      .sort((a, b) => a.date.getTime() - b.date.getTime() || (depotById.get(a.depotId!)?.nameEn ?? "").localeCompare(depotById.get(b.depotId!)?.nameEn ?? ""));
    for (const r of lines) {
      const depot = depotById.get(r.depotId!);
      yield csvLine([
        formatIstDate(r.date), depot?.district.nameEn ?? "", depot?.nameEn ?? "", r.tripsScheduled, r.tripsCompleted,
        r.tripsCancelled, r.onTimePct, r.avgDelayMin, r.passengers, r.ticketsSold, rupees(r.revenuePaise), r.incidents, r.complaints,
      ]);
    }
  }

  /** One line per route over the whole range, the same numbers as /analytics/routes. */
  private async *routePerformance(scope: AnalyticsScope, range: ReturnType<AnalyticsService["range"]>): AsyncGenerator<string> {
    yield csvLine([
      "Route code", "Route (English)", "Route (Telugu)", "Trips", "Cancelled", "Passengers", "Load factor %",
      "Average delay (min)", "Revenue (INR)",
    ]);
    for (const r of await this.analytics.routesIn(scope.depotIds, range)) {
      yield csvLine([
        r.routeCode, r.routeNameEn, r.routeNameTe, r.trips, r.cancellations, r.passengers, r.loadFactorPct, r.avgDelayMin, rupees(r.revenuePaise),
      ]);
    }
  }

  /** Complaints created in the range. State and platform roles also see complaints without a depot. */
  private async *complaints(scope: AnalyticsScope, start: Date, end: Date): AsyncGenerator<string> {
    yield csvLine([
      "Complaint code", "Created (IST)", "Category", "Status", "Depot", "Route code", "Bus", "Travel date", "Message",
      "Resolution note", "Resolved (IST)",
    ]);
    let cursor: string | undefined;
    for (;;) {
      const page = await this.prisma.complaint.findMany({
        where: { createdAt: { gte: start, lt: end }, ...complaintScopeOf(scope) },
        include: { depot: { select: { nameEn: true } } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: PAGE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      for (const c of page) {
        yield csvLine([
          c.code, istStamp(c.createdAt), c.category, c.status, c.depot?.nameEn ?? "", c.routeCode ?? "", c.busRegNo ?? "",
          c.travelDate ? formatIstDate(c.travelDate) : "", c.message, c.resolutionNote ?? "", istStamp(c.resolvedAt),
        ]);
      }
      if (page.length < PAGE) return;
      cursor = page.at(-1)!.id;
    }
  }

  /** Every ticket of trips in the range, read in pages. No passenger names or contact details. */
  private async *tickets(scope: AnalyticsScope, fromDate: Date, toDate: Date): AsyncGenerator<string> {
    yield csvLine([
      "Ticket code", "Type", "Status", "Trip code", "Service date", "Departure (IST)", "Route code", "From (English)",
      "From (Telugu)", "To (English)", "To (Telugu)", "Seat", "Fare (INR)", "Booked (IST)",
    ]);
    let cursor: string | undefined;
    for (;;) {
      const page = await this.prisma.ticket.findMany({
        where: {
          trip: { serviceDate: { gte: fromDate, lte: toDate } },
          ...(scope.all ? {} : { route: { depotId: { in: scope.depotIds } } }),
        },
        select: {
          id: true, code: true, type: true, status: true, seatNo: true, farePaise: true, createdAt: true,
          trip: { select: { code: true, serviceDate: true, scheduledDepartureAt: true } },
          route: { select: { code: true } },
          boardingStop: { select: { nameEn: true, nameTe: true } },
          droppingStop: { select: { nameEn: true, nameTe: true } },
        },
        orderBy: { id: "asc" },
        take: PAGE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      for (const t of page) {
        yield csvLine([
          t.code, t.type, t.status, t.trip.code, formatIstDate(t.trip.serviceDate), formatIstTime(t.trip.scheduledDepartureAt),
          t.route.code, t.boardingStop.nameEn, t.boardingStop.nameTe, t.droppingStop.nameEn, t.droppingStop.nameTe,
          t.seatNo ?? "", rupees(t.farePaise), istStamp(t.createdAt),
        ]);
      }
      if (page.length < PAGE) return;
      cursor = page.at(-1)!.id;
    }
  }
}
