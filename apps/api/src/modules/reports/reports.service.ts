import { formatIstDate, formatIstTime } from "@aptransit/shared";
import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { formatCsvWithBom } from "./csv-helper";

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async generateReport(kind: string, from: string, to: string): Promise<string> {
    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const toDate = new Date(`${to}T23:59:59.999Z`);

    switch (kind) {
      case "daily-operations":
        return this.generateDailyOperationsCsv(fromDate, toDate);
      case "route-performance":
        return this.generateRoutePerformanceCsv(fromDate, toDate);
      case "complaints":
        return this.generateComplaintsCsv(fromDate, toDate);
      case "tickets":
        return this.generateTicketsCsv(from, to);
      default:
        throw new BadRequestException(`Unknown report kind: ${kind}`);
    }
  }

  private async generateDailyOperationsCsv(fromDate: Date, toDate: Date): Promise<string> {
    const stats = await this.prisma.dailyStats.findMany({
      where: {
        date: { gte: fromDate, lte: toDate },
      },
      orderBy: { date: "asc" },
    });

    const rows: Array<Array<unknown>> = [
      [
        "Date",
        "District ID",
        "Depot ID",
        "Route ID",
        "Trips Scheduled",
        "Trips Completed",
        "Trips Cancelled",
        "On-Time %",
        "Avg Delay (min)",
        "Passengers",
        "Revenue (INR)",
      ],
    ];

    for (const s of stats) {
      rows.push([
        formatIstDate(s.date),
        s.districtId || "All",
        s.depotId || "All",
        s.routeId || "All",
        s.tripsScheduled,
        s.tripsCompleted,
        s.tripsCancelled,
        s.onTimePct,
        s.avgDelayMin,
        s.passengers,
        Number(s.revenuePaise) / 100,
      ]);
    }

    return formatCsvWithBom(rows);
  }

  private async generateRoutePerformanceCsv(fromDate: Date, toDate: Date): Promise<string> {
    const routes = await this.prisma.route.findMany({
      include: {
        trips: {
          where: {
            serviceDate: {
              gte: fromDate,
              lte: toDate,
            },
          },
          include: {
            busType: true,
            tickets: {
              where: { status: { notIn: ["CANCELLED", "REFUNDED"] } },
            },
          },
        },
      },
      orderBy: { code: "asc" },
    });

    const rows: Array<Array<unknown>> = [
      [
        "Route Code",
        "Name (EN)",
        "Name (TE)",
        "Trips",
        "Passengers",
        "Load Factor %",
        "Avg Delay (min)",
        "Revenue (INR)",
      ],
    ];

    for (const r of routes) {
      let totalPassengers = 0;
      let totalRevenuePaise = 0;
      let totalDelay = 0;
      let totalSeats = 0;

      for (const t of r.trips) {
        totalDelay += t.delayMinutes;
        totalSeats += t.busType?.totalSeats || 40;
        for (const tk of t.tickets) {
          totalPassengers += 1;
          totalRevenuePaise += tk.farePaise;
        }
      }

      const tripsCount = r.trips.length;
      const avgDelay = tripsCount > 0 ? Math.round((totalDelay / tripsCount) * 10) / 10 : 0;
      const loadFactor =
        totalSeats > 0 ? Math.min(100, Math.round((totalPassengers / totalSeats) * 1000) / 10) : 0;

      rows.push([
        r.code,
        r.nameEn,
        r.nameTe,
        tripsCount,
        totalPassengers,
        loadFactor,
        avgDelay,
        totalRevenuePaise / 100,
      ]);
    }

    return formatCsvWithBom(rows);
  }

  private async generateComplaintsCsv(fromDate: Date, toDate: Date): Promise<string> {
    const complaints = await this.prisma.complaint.findMany({
      where: {
        createdAt: { gte: fromDate, lte: toDate },
      },
      orderBy: { createdAt: "desc" },
    });

    const rows: Array<Array<unknown>> = [
      [
        "Complaint Code",
        "Category",
        "Status",
        "Date",
        "Route Code",
        "Bus Reg",
        "Message",
        "Resolution Note",
      ],
    ];

    for (const c of complaints) {
      rows.push([
        c.code,
        c.category,
        c.status,
        formatIstDate(c.createdAt),
        c.routeCode || "",
        c.busRegNo || "",
        c.message,
        c.resolutionNote || "",
      ]);
    }

    return formatCsvWithBom(rows);
  }

  private async generateTicketsCsv(from: string, to: string): Promise<string> {
    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const toDate = new Date(`${to}T23:59:59.999Z`);

    const tickets = await this.prisma.ticket.findMany({
      where: {
        trip: {
          serviceDate: { gte: fromDate, lte: toDate },
        },
      },
      include: {
        trip: {
          include: {
            route: true,
          },
        },
        boardingStop: true,
        droppingStop: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    const rows: Array<Array<unknown>> = [
      [
        "Ticket Code",
        "Trip Code",
        "Service Date",
        "Departure Time (IST)",
        "From Stop (EN)",
        "From Stop (TE)",
        "To Stop (EN)",
        "To Stop (TE)",
        "Passenger Count",
        "Fare (INR)",
        "Status",
        "Booked At",
      ],
    ];

    for (const t of tickets) {
      rows.push([
        t.code,
        t.trip.code,
        formatIstDate(t.trip.serviceDate),
        formatIstTime(t.trip.scheduledDepartureAt),
        t.boardingStop.nameEn,
        t.boardingStop.nameTe,
        t.droppingStop.nameEn,
        t.droppingStop.nameTe,
        1,
        t.farePaise / 100,
        t.status,
        t.createdAt.toISOString(),
      ]);
    }

    return formatCsvWithBom(rows);
  }
}
