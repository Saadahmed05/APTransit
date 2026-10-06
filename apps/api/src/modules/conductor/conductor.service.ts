import {
  type ConductorManifestDto,
  type ConductorTodayDto,
  formatIstDate,
} from "@aptransit/shared";
import { Injectable } from "@nestjs/common";
import { AppError } from "../../common/errors/app-error";
import { PrismaService } from "../../prisma/prisma.service";
import { toTripDto } from "../tracking/trip-context.service";

@Injectable()
export class ConductorService {
  constructor(private readonly prisma: PrismaService) {}

  async assignment(userId: string, tripId?: string, now = new Date()) {
    const rows = await this.prisma.tripAssignment.findMany({
      where: {
        endedAt: null,
        conductor: { userId },
        trip: {
          serviceDate: new Date(`${formatIstDate(now)}T00:00:00.000Z`),
          status: { in: ["RUNNING", "SCHEDULED"] },
          ...(tripId ? { id: tripId } : {}),
        },
      },
      include: {
        conductor: true,
        bus: { include: { busType: true } },
        trip: { include: { route: true } },
      },
      orderBy: { trip: { scheduledDepartureAt: "asc" } },
    });
    return rows.find((a) => a.trip.status === "RUNNING") ?? rows[0] ?? null;
  }

  async current(userId: string, tripId: string, now = new Date()) {
    const assignment = await this.prisma.tripAssignment.findFirst({
      relationLoadStrategy: "join",
      where: {
        endedAt: null,
        conductor: { userId },
        trip: { status: "RUNNING", serviceDate: new Date(`${formatIstDate(now)}T00:00:00.000Z`) },
      },
      select: {
        tripId: true,
        conductorId: true,
        bus: { select: { busType: { select: { serviceType: true } } } },
        trip: { select: { status: true, route: { select: { nameEn: true } } } },
      },
      orderBy: { trip: { scheduledDepartureAt: "asc" } },
    });
    if (!assignment || assignment.tripId !== tripId || assignment.trip.status !== "RUNNING")
      throw new AppError("FORBIDDEN", "This is not the conductor's current running trip");
    return assignment;
  }

  async manifest(userId: string, tripId: string): Promise<ConductorManifestDto> {
    const assignment = await this.assignment(userId, tripId);
    if (!assignment) throw new AppError("FORBIDDEN", "This trip is not assigned to you");
    return this.counts(tripId);
  }

  private async counts(tripId: string): Promise<ConductorManifestDto> {
    const [tickets, passScans] = await Promise.all([
      this.prisma.ticket.findMany({
        where: { tripId, status: { in: ["BOOKED", "ACTIVE", "SCANNED", "USED"] } },
        select: { seatNo: true, status: true },
      }),
      this.prisma.ticketScan.count({ where: { tripId, passId: { not: null }, result: "VALID" } }),
    ]);
    const checked =
      tickets.filter((t) => ["SCANNED", "USED"].includes(t.status)).length + passScans;
    const passengers = tickets.length + passScans;
    return {
      counts: { passengers, checked, pending: passengers - checked },
      seats: tickets.map((t) => ({
        seatNo: t.seatNo,
        state: ["SCANNED", "USED"].includes(t.status) ? "CHECKED" : "PENDING",
      })),
    };
  }

  async today(userId: string): Promise<ConductorTodayDto> {
    const assignment = await this.assignment(userId);
    if (!assignment)
      return { trip: null, route: null, counts: { passengers: 0, checked: 0, pending: 0 } };
    return {
      trip: toTripDto(assignment.trip),
      route: { nameEn: assignment.trip.route.nameEn, nameTe: assignment.trip.route.nameTe },
      counts: (await this.counts(assignment.tripId)).counts,
    };
  }
}
