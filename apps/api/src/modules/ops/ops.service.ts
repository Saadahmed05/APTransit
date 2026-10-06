import {
  can,
  formatIstDate,
  SeatLayoutSchema,
  type Permission,
  type OpsQuery,
  type OpsBusInput,
  type OpsBusPatch,
  type MaintenanceInput,
  type AssignTripInput,
  type ReplaceBusInput,
  type OpsStaffInput,
  OpsDashboardDto,
  BusStatus,
  TripStatus,
  IncidentStatus,
} from "@aptransit/shared";
import { z } from "zod";
import { Inject, Injectable } from "@nestjs/common";
import type { AuthenticatedUser } from "../../common/auth/auth.types";
import { AppError } from "../../common/errors/app-error";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { PrismaService } from "../../prisma/prisma.service";
import { RedisService } from "../../redis/redis.service";
import type { Prisma } from "../../generated/prisma/client";
import { AuditService, type LogAuditParams } from "../audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PAYMENT_PROVIDER, type PaymentProvider } from "../payments/payment-provider";
import { toTripDto, displayStatusOf } from "../tracking/trip-context.service";
function statusFilter<T>(schema: z.ZodType<T>, value: string | undefined): T | undefined {
  if (value === undefined) return undefined;
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", "Invalid status filter");
  return parsed.data;
}
type Actor = Pick<LogAuditParams, "actorUserId" | "actorRole" | "ip" | "userAgent">;
const assignmentInclude = {
  bus: true,
  driver: { include: { user: true } },
  conductor: { include: { user: true } },
} as const;
const tripInclude = {
  route: { include: { depot: true } },
  assignments: { include: assignmentInclude, orderBy: { startedAt: "desc" } },
  tickets: {
    where: { status: { in: ["BOOKED", "ACTIVE", "SCANNED", "USED"] } },
    select: { id: true },
  },
  incidents: true,
} as const satisfies Prisma.TripInclude;
type TripRow = Prisma.TripGetPayload<{ include: typeof tripInclude }>;
type BusRow = Prisma.BusGetPayload<{ include: { busType: true } }>;
type AssignmentRow = TripRow["assignments"][number];
const assignmentDto = (a: AssignmentRow) => ({
  id: a.id,
  busId: a.busId,
  busRegNo: a.bus.regNo,
  driverId: a.driverId,
  driverName: a.driver.user.name,
  conductorId: a.conductorId,
  conductorName: a.conductor?.user.name ?? null,
  reason: a.reason,
  startedAt: a.startedAt.toISOString(),
  endedAt: a.endedAt?.toISOString() ?? null,
});
const incidentDto = (i: TripRow["incidents"][number]) => ({
  ...i,
  createdAt: i.createdAt.toISOString(),
});
const tripDto = (t: TripRow) => ({
  ...toTripDto(t),
  routeId: t.routeId,
  routeNameEn: t.route.nameEn,
  routeNameTe: t.route.nameTe,
  depotId: t.route.depotId,
  passengers: t.tickets.length,
  assignment: t.assignments.find((a) => !a.endedAt)
    ? assignmentDto(t.assignments.find((a) => !a.endedAt)!)
    : null,
});
const busDto = (b: BusRow) => ({
  id: b.id,
  regNo: b.regNo,
  busTypeId: b.busTypeId,
  depotId: b.depotId,
  status: b.status,
  serviceType: b.busType.serviceType,
  totalSeats: b.busType.totalSeats,
  maintenanceDueAt: b.maintenanceDueAt?.toISOString() ?? null,
  odometerKm: b.odometerKm,
});
const maintenanceDto = (m: {
  id: string;
  busId: string;
  kind: string;
  note: string | null;
  startAt: Date;
  endAt: Date | null;
}) => ({ ...m, startAt: m.startAt.toISOString(), endAt: m.endAt?.toISOString() ?? null });

@Injectable()
export class OpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly events: DomainEventsService,
    private readonly notifications: NotificationsService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  scope(
    user: AuthenticatedUser,
    permission: Permission = "ops:read",
    depotId?: string,
  ): Prisma.DepotWhereInput {
    const roles = user.roles.filter((r) => can([r.role], permission));
    if (!roles.length) throw new AppError("FORBIDDEN", "Permission denied");
    const global = roles.some((r) =>
      ["STATE_ADMIN", "SUPER_ADMIN", "TRANSPORT_OFFICER"].includes(r.role),
    );
    const allowed: Prisma.DepotWhereInput = global
      ? {}
      : {
          OR: roles.flatMap<Prisma.DepotWhereInput>((r) =>
            r.role === "DISTRICT_OFFICER" && r.districtId
              ? [{ districtId: r.districtId }]
              : r.depotId
                ? [{ id: r.depotId }]
                : [],
          ),
        };
    return depotId ? { AND: [allowed, { id: depotId }] } : allowed;
  }
  private async depot(user: AuthenticatedUser, id: string, permission: Permission = "ops:read") {
    const depot = await this.prisma.depot.findFirst({ where: this.scope(user, permission, id) });
    if (!depot) throw new AppError("FORBIDDEN", "Depot is outside your scope");
    return depot;
  }
  private async trip(user: AuthenticatedUser, id: string, permission: Permission = "ops:read") {
    const trip = await this.prisma.trip.findUnique({ where: { id }, include: tripInclude });
    if (!trip) throw new AppError("NOT_FOUND", "Trip not found");
    await this.depot(user, trip.route.depotId, permission);
    return trip;
  }
  private async bus(user: AuthenticatedUser, id: string, permission: Permission = "ops:read") {
    const bus = await this.prisma.bus.findUnique({ where: { id }, include: { busType: true } });
    if (!bus) throw new AppError("NOT_FOUND", "Bus not found");
    await this.depot(user, bus.depotId, permission);
    return bus;
  }
  private async log(
    actor: Actor,
    action: string,
    entityType: string,
    entityId: string,
    after: unknown,
    before?: unknown,
  ) {
    await this.audit.log({ ...actor, action, entityType, entityId, after, before });
  }
  async dashboard(user: AuthenticatedUser, query: OpsQuery = {}) {
    if (query.depotId) await this.depot(user, query.depotId);
    const scope = this.scope(user, "ops:read", query.depotId);
    const [buses, trips] = await Promise.all([
      this.prisma.bus.findMany({
        where: { depot: scope },
        select: { id: true, depotId: true, status: true },
      }),
      this.prisma.trip.findMany({
        where: {
          route: { depot: scope },
          OR: [
            { serviceDate: new Date(formatIstDate(new Date()) + "T00:00:00Z") },
            { status: "RUNNING" },
            { incidents: { some: { status: { not: "RESOLVED" } } } },
          ],
        },
        select: {
          id: true,
          status: true,
          delayMinutes: true,
          hasOpenIncident: true,
          route: { select: { depotId: true } },
          assignments: { where: { endedAt: null }, select: { busId: true } },
          incidents: { where: { status: { not: "RESOLVED" } }, select: { id: true } },
        },
      }),
    ]);
    const ids = [...new Set(buses.map((b) => b.depotId))];
    const sets = await Promise.all(ids.map((id) => this.redis.client.smembers("depot:live:" + id)));
    const live = new Set(sets.flat());
    const running = trips.filter((t) => t.status === "RUNNING");
    const busStatusCounts = { IDLE: 0, RUNNING: 0, DELAYED: 0, BREAKDOWN: 0, MAINTENANCE: 0 };
    for (const bus of buses) busStatusCounts[bus.status]++;
    return OpsDashboardDto.parse({
      activeBuses: new Set(
        running.filter((t) => live.has(t.id)).flatMap((t) => t.assignments.map((a) => a.busId)),
      ).size,
      totalBuses: buses.length,
      activeTrips: running.length,
      delayedTrips: running.filter((t) => displayStatusOf(t) === "DELAYED").length,
      breakdowns: busStatusCounts.BREAKDOWN,
      openIncidents: trips.reduce((sum, t) => sum + t.incidents.length, 0),
      busStatusCounts,
    });
  }
  depots(user: AuthenticatedUser) { return this.prisma.depot.findMany({ where: this.scope(user), orderBy: { nameEn: "asc" } }); }
  busTypes() { return this.prisma.busType.findMany({ orderBy: { nameEn: "asc" } }); }
  routes(user: AuthenticatedUser, q: OpsQuery) { return this.prisma.route.findMany({ where: { depot: this.scope(user,"ops:read",q.depotId) }, orderBy: { nameEn: "asc" } }); }
  async buses(user: AuthenticatedUser, q: OpsQuery) {
    const status = statusFilter(BusStatus, q.status);
    if (q.depotId) await this.depot(user, q.depotId);
    return (
      await this.prisma.bus.findMany({
        where: {
          depot: this.scope(user, "ops:read", q.depotId),
          status,
          ...(q.q ? { regNo: { contains: q.q, mode: "insensitive" as const } } : {}),
        },
        include: { busType: true, tripAssignments: { where: { endedAt: null, trip: { status: "RUNNING" } }, take: 1, orderBy: { startedAt: "desc" }, include: { trip: { include: { route: true } }, driver: { include: { user: true } } } } },
        orderBy: { regNo: "asc" },
      })
    ).map(b => ({ ...busDto(b), currentRouteNameEn: b.tripAssignments?.[0]?.trip?.route?.nameEn ?? null, currentRouteNameTe: b.tripAssignments?.[0]?.trip?.route?.nameTe ?? null, driverName: b.tripAssignments?.[0]?.driver?.user?.name ?? null }));
  }
  async busProfile(user: AuthenticatedUser, id: string) {
    const bus = await this.bus(user, id);
    const [trips, maintenance] = await Promise.all([
      this.prisma.trip.findMany({
        where: { assignments: { some: { busId: id } } },
        include: tripInclude,
        orderBy: { scheduledDepartureAt: "desc" },
        take: 20,
      }),
      this.prisma.maintenanceRecord.findMany({
        where: { busId: id },
        orderBy: { startAt: "desc" },
        take: 20,
      }),
    ]);
    return {
      ...busDto(bus),
      trips: trips.map(tripDto),
      maintenance: maintenance.map(maintenanceDto),
    };
  }
  async createBus(user: AuthenticatedUser, b: OpsBusInput, actor: Actor) {
    await this.depot(user, b.depotId, "fleet:write");
    const bus = await this.prisma.bus.create({
      data: { ...b, maintenanceDueAt: b.maintenanceDueAt ? new Date(b.maintenanceDueAt) : null },
      include: { busType: true },
    });
    await this.log(actor, "fleet.create", "bus", bus.id, {
      regNo: bus.regNo,
      depotId: bus.depotId,
    });
    return busDto(bus);
  }
  async patchBus(user: AuthenticatedUser, id: string, b: OpsBusPatch, actor: Actor) {
    const before = await this.bus(user, id, "fleet:write");
    if (b.depotId) await this.depot(user, b.depotId, "fleet:write");
    const bus = await this.prisma.$transaction(async (tx) => {
      await tx.bus.update({ where: { id }, data: { updatedAt: new Date() } });
      const active = await tx.tripAssignment.count({
        where: { busId: id, endedAt: null, trip: { status: { in: ["RUNNING", "SCHEDULED"] } } },
      });
      if (active && (b.busTypeId || b.depotId || b.status))
        throw new AppError("BUS_NOT_AVAILABLE", "Change assigned buses through the trip workflow");
      return tx.bus.update({
        where: { id },
        data: {
          ...b,
          ...(b.maintenanceDueAt !== undefined
            ? { maintenanceDueAt: b.maintenanceDueAt ? new Date(b.maintenanceDueAt) : null }
            : {}),
        },
        include: { busType: true },
      });
    });
    await this.log(actor, "fleet.update", "bus", id, { ...b, depotId: bus.depotId }, {
      depotId: before.depotId,
    });
    return this.busProfile(user, bus.id);
  }
  async maintenance(user: AuthenticatedUser, id: string, b: MaintenanceInput, actor: Actor) {
    const bus = await this.bus(user, id, "fleet:write");
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.bus.update({ where: { id }, data: { updatedAt: new Date() } });
      const overlap = await tx.tripAssignment.count({
        where: {
          busId: id,
          endedAt: null,
          trip: {
            status: { in: ["SCHEDULED", "RUNNING"] },
            scheduledArrivalAt: { gt: new Date(b.startAt) },
            ...(b.endAt ? { scheduledDepartureAt: { lt: new Date(b.endAt) } } : {}),
          },
        },
      });
      if (overlap) throw new AppError("BUS_NOT_AVAILABLE", "Bus has an overlapping trip");
      const m = await tx.maintenanceRecord.create({
        data: {
          busId: id,
          kind: b.kind,
          note: b.note ?? null,
          startAt: new Date(b.startAt),
          endAt: b.endAt ? new Date(b.endAt) : null,
        },
      });
      if (!b.endAt || new Date(b.endAt) > new Date())
        await tx.bus.update({ where: { id }, data: { status: "MAINTENANCE" } });
      return m;
    });
    await this.log(actor, "fleet.maintenance", "maintenance_record", row.id, {
      ...b,
      depotId: bus.depotId,
    });
    return maintenanceDto(row);
  }
  async available(user: AuthenticatedUser, q: OpsQuery) {
    const at = new Date(q.at ?? new Date().toISOString());
    if (q.depotId) await this.depot(user, q.depotId);
    return (
      await this.prisma.bus.findMany({
        where: {
          depot: this.scope(user, "ops:read", q.depotId),
          status: "IDLE",
          maintenanceRecords: {
            none: { startAt: { lte: at }, OR: [{ endAt: null }, { endAt: { gt: at } }] },
          },
          tripAssignments: {
            none: {
              endedAt: null,
              trip: {
                status: { in: ["SCHEDULED", "RUNNING"] },
                scheduledDepartureAt: { lte: at },
                scheduledArrivalAt: { gt: at },
              },
            },
          },
        },
        include: { busType: true },
        orderBy: { regNo: "asc" },
      })
    ).map(busDto);
  }
  async trips(user: AuthenticatedUser, q: OpsQuery) {
    if (q.depotId) await this.depot(user, q.depotId);
    const status = statusFilter(TripStatus, q.status);
    return (
      await this.prisma.trip.findMany({
        where: {
          route: { depot: this.scope(user, "ops:read", q.depotId) },
          serviceDate: new Date((q.date ?? formatIstDate(new Date())) + "T00:00:00Z"),
          status,
          routeId: q.routeId,
        },
        include: tripInclude,
        orderBy: { scheduledDepartureAt: "asc" },
      })
    ).map(tripDto);
  }
  async tripProfile(user: AuthenticatedUser, id: string) {
    const t = await this.trip(user, id);
    return {
      ...tripDto(t),
      assignments: t.assignments.map(assignmentDto),
      incidents: t.incidents.map(incidentDto),
    };
  }
  async assign(
    user: AuthenticatedUser,
    id: string,
    b: AssignTripInput | ReplaceBusInput,
    actor: Actor,
    replacement = false,
  ) {
    const permission = replacement ? "trip:replace-bus" : "trip:assign";
    const before = await this.trip(user, id, permission);
    const current = before.assignments.find((a) => !a.endedAt);
    const driverId = b.driverId ?? current?.driverId;
    const conductorId = "conductorId" in b ? b.conductorId : current?.conductorId;
    if (!driverId) throw new AppError("BUS_NOT_AVAILABLE", "A driver is required");
    const now = new Date();
    if (replacement ? before.status !== "RUNNING" : before.status !== "SCHEDULED")
      throw new AppError("TRIP_NOT_STARTABLE", "Trip state does not allow this assignment");
    const updated = await this.prisma.$transaction(async (tx) => {
      // Row locks serialize reservations of each resource across API processes.
      await tx.trip.update({ where: { id }, data: { updatedAt: now } });
      const bus = await tx.bus.update({
        where: { id: b.busId },
        data: { updatedAt: now },
        include: { busType: true },
      });
      const driver = await tx.driver.update({ where: { id: driverId }, data: { updatedAt: now } });
      const conductor = conductorId
        ? await tx.conductor.update({ where: { id: conductorId }, data: { updatedAt: now } })
        : null;
      if (
        bus.depotId !== before.route.depotId ||
        driver.depotId !== before.route.depotId ||
        (conductor && conductor.depotId !== before.route.depotId)
      )
        throw new AppError("FORBIDDEN", "Resources must belong to this depot");
      const trip = await tx.trip.findUniqueOrThrow({ where: { id }, include: tripInclude });
      if (trip.status !== before.status)
        throw new AppError("TRIP_NOT_STARTABLE", "Trip changed while assigning");
      const old = trip.assignments.find((a) => !a.endedAt);
      if (replacement && !old) throw new AppError("TRIP_NOT_ASSIGNED", "No current assignment");
      if (replacement && old?.busId === b.busId)
        throw new AppError("BUS_NOT_AVAILABLE", "Replacement must be another bus");
      const start = replacement ? now : trip.scheduledDepartureAt;
      const end = new Date(trip.scheduledArrivalAt.getTime() + trip.delayMinutes * 60_000);
      const overlap = {
        status: { in: ["SCHEDULED", "RUNNING"] as ("SCHEDULED" | "RUNNING")[] },
        scheduledDepartureAt: { lt: end },
        scheduledArrivalAt: { gt: start },
      };
      const busy = await tx.tripAssignment.count({
        where: {
          tripId: { not: id },
          endedAt: null,
          trip: overlap,
          OR: [{ busId: b.busId }, { driverId }, ...(conductorId ? [{ conductorId }] : [])],
        },
      });
      const maintenance = await tx.maintenanceRecord.count({
        where: {
          busId: b.busId,
          startAt: { lt: end },
          OR: [{ endAt: null }, { endAt: { gt: start } }],
        },
      });
      if (
        busy ||
        maintenance ||
        ["BREAKDOWN", "MAINTENANCE"].includes(bus.status) ||
        (bus.status !== "IDLE" && bus.id !== old?.busId)
      )
        throw new AppError("BUS_NOT_AVAILABLE", "Bus or staff is unavailable");
      const oldType = await tx.busType.findUniqueOrThrow({ where: { id: trip.busTypeId } });
      const tickets = await tx.ticket.findMany({
        where: { tripId: id, status: { in: ["BOOKED", "ACTIVE", "SCANNED", "USED"] } },
        select: { seatNo: true },
      });
      const layout = SeatLayoutSchema.parse(bus.busType.seatLayout);
      if (
        bus.busType.totalSeats < oldType.totalSeats ||
        tickets.some((t) => t.seatNo && !layout.labels.includes(t.seatNo))
      )
        throw new AppError("BUS_NOT_AVAILABLE", "Replacement cannot preserve every seat", {
          reason: "INSUFFICIENT_SEATS",
        });
      if (old) await tx.tripAssignment.update({ where: { id: old.id }, data: { endedAt: now } });
      if (replacement && old)
        await tx.bus.update({
          where: { id: old.busId },
          data: {
            status: trip.incidents.some(
              (i) => i.busId === old.busId && i.type === "BREAKDOWN" && i.status !== "RESOLVED",
            )
              ? "BREAKDOWN"
              : old.bus.status,
          },
        });
      await tx.tripAssignment.create({
        data: {
          tripId: id,
          busId: b.busId,
          driverId,
          conductorId: conductorId ?? null,
          reason: replacement ? "REPLACEMENT" : "INITIAL",
          assignedById: user.id,
          startedAt: now,
        },
      });
      await tx.bus.update({
        where: { id: b.busId },
        data: { status: replacement ? "RUNNING" : "IDLE" },
      });
      return tx.trip.update({
        where: { id },
        data: { busTypeId: bus.busTypeId },
        include: tripInclude,
      });
    });
    await this.log(actor, replacement ? "trip.replace_bus" : "trip.assign", "trip", id, {
      depotId: updated.route.depotId,
      busId: b.busId,
      driverId,
      ...("reason" in b ? { reason: b.reason } : {}),
    });
    if (replacement) {
      await this.notifyHolders(
        id,
        "REPLACEMENT_BUS",
        { busNo: updated.assignments.find((a) => !a.endedAt)!.bus.regNo },
        "replacement:" + updated.assignments.find((a) => !a.endedAt)!.id,
      );
      this.events.publish("trip.bus_replaced", { tripId: id, busId: b.busId, driverId });
      await this.redis.client.del("bus:live:" + id);
    }
    this.publishTrip(updated);
    return toTripDto(updated);
  }
  private publishTrip(trip: TripRow) {
    this.events.publish("trip.status", {
      tripId: trip.id,
      status: trip.status,
      displayStatus: displayStatusOf(trip),
      delayMinutes: trip.delayMinutes,
      lastStopSeq: trip.lastStopSeq,
      rooms: {
        tripId: trip.id,
        routeId: trip.routeId,
        depotId: trip.route.depotId,
        districtId: trip.route.depot.districtId,
      },
    });
  }
  private async notifyHolders(
    tripId: string,
    type: "REPLACEMENT_BUS" | "TRIP_CANCELLED",
    params: Record<string, string>,
    key: string,
  ) {
    const tickets = await this.prisma.ticket.findMany({
      where: { tripId, status: { in: ["BOOKED", "ACTIVE"] } },
      select: { holderUserId: true },
    });
    await Promise.all(
      [...new Set(tickets.map((t) => t.holderUserId))].map((id) =>
        this.notifications.notify(id, type, params, "/track/" + tripId, key),
      ),
    );
  }
  async cancel(user: AuthenticatedUser, id: string, reason: string, actor: Actor) {
    const trip = await this.trip(user, id, "trip:cancel");
    if (trip.status === "COMPLETED")
      throw new AppError("TRIP_NOT_STARTABLE", "Completed trips cannot be cancelled");
    if (trip.status === "CANCELLED") return toTripDto(trip);
    // Claim cancellation once. Pending refund rows survive provider failures and retries.
    const result = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.trip.updateMany({
        where: { id, status: trip.status },
        data: { status: "CANCELLED" },
      });
      if (changed.count !== 1)
        throw new AppError("TRIP_NOT_STARTABLE", "Trip changed during cancellation");
      const tickets = await tx.ticket.findMany({
        where: { tripId: id, status: { in: ["BOOKED", "ACTIVE"] } },
      });
      const policy = await tx.refundPolicy.findFirst({
        where: { validFrom: { lte: new Date() } },
        orderBy: { validFrom: "desc" },
      });
      if (!policy && tickets.some((t) => t.farePaise > 0))
        throw new AppError("INTERNAL", "Refund policy missing");
      const refunds = [];
      const processedTickets = [];
      for (const t of tickets) {
        const claimed = await tx.ticket.updateMany({
          where: { id: t.id, status: { in: ["BOOKED", "ACTIVE"] } },
          data: {
            version: { increment: 1 },
            ...(t.farePaise === 0 ? { status: "REFUNDED" as const } : {}),
          },
        });
        if (claimed.count !== 1) continue;
        processedTickets.push(t);
        if (t.farePaise === 0) continue;
        const payment = await tx.payment.findFirst({
          where: {
            bookingId: t.bookingId,
            status: { in: ["CAPTURED", "PARTIALLY_REFUNDED"] },
            providerPaymentId: { not: null },
          },
          orderBy: { capturedAt: "desc" },
        });
        if (!payment?.providerPaymentId) throw new AppError("INTERNAL", "Captured payment missing");
        const row = await tx.refund.create({
          data: {
            paymentId: payment.id,
            ticketId: t.id,
            amountPaise: t.farePaise,
            status: "PENDING",
            policyId: policy!.id,
            reason: "OPERATOR_CANCELLED",
          },
        });
        refunds.push({ row, providerPaymentId: payment.providerPaymentId });
      }
      return { tickets: processedTickets, refunds };
    });
    const params = {
      routeEn: trip.route.nameEn,
      routeTe: trip.route.nameTe,
      departureAt: trip.scheduledDepartureAt.toISOString(),
    };
    await Promise.all(
      [...new Set(result.tickets.map((t) => t.holderUserId))].map((id) =>
        this.notifications.notify(id, "TRIP_CANCELLED", params, "/tickets", "cancel:" + trip.id),
      ),
    );
    for (const item of result.refunds) {
      try {
        const refund = await this.provider.createRefund({
          paymentId: item.providerPaymentId,
          amountPaise: item.row.amountPaise,
          notes: { ticketId: item.row.ticketId!, reason: "OPERATOR_CANCELLED" },
        });
        await this.prisma.refund.update({
          where: { id: item.row.id },
          data: { providerRefundId: refund.id },
        });
      } catch {
        await this.prisma.refund.update({ where: { id: item.row.id }, data: { status: "FAILED" } });
      }
      await this.log(actor, "refund.create", "refund", item.row.id, {
        depotId: trip.route.depotId,
        amountPaise: item.row.amountPaise,
        reason: "OPERATOR_CANCELLED",
      });
    }
    for (const t of result.tickets.filter((t) => t.farePaise === 0))
      this.events.publish("ticket.status", {
        ticketId: t.id,
        holderUserId: t.holderUserId,
        from: t.status,
        to: "REFUNDED",
      });
    await this.prisma.tripAssignment.updateMany({
      where: { tripId: id, endedAt: null },
      data: { endedAt: new Date() },
    });
    await this.redis.client.srem("depot:live:" + trip.route.depotId, id);
    await this.redis.client.del("bus:live:" + id);
    for (const a of trip.assignments.filter((a) => !a.endedAt))
      if (["RUNNING", "DELAYED"].includes(a.bus.status))
        await this.prisma.bus.update({ where: { id: a.busId }, data: { status: "IDLE" } });
    const updated = await this.trip(user, id, "trip:cancel");
    this.publishTrip(updated);
    await this.log(actor, "trip.cancel", "trip", id, {
      depotId: trip.route.depotId,
      reason,
      status: "CANCELLED",
    });
    return toTripDto(updated);
  }
  async staff(user: AuthenticatedUser, q: OpsQuery) {
    if (q.depotId) await this.depot(user, q.depotId);
    const scope = this.scope(user, "ops:read", q.depotId);
    const [drivers, conductors] = await Promise.all([
      q.type === "CONDUCTOR"
        ? []
        : this.prisma.driver.findMany({ where: { depot: scope }, include: { user: true } }),
      q.type === "DRIVER"
        ? []
        : this.prisma.conductor.findMany({ where: { depot: scope }, include: { user: true } }),
    ]);
    return [
      ...drivers.map((d) => ({
        id: d.id,
        userId: d.userId,
        depotId: d.depotId,
        type: "DRIVER",
        email: d.user.email,
        name: d.user.name,
        employeeCode: d.employeeCode,
        licenseNo: d.licenseNo,
      })),
      ...conductors.map((c) => ({
        id: c.id,
        userId: c.userId,
        depotId: c.depotId,
        type: "CONDUCTOR",
        email: c.user.email,
        name: c.user.name,
        employeeCode: c.employeeCode,
      })),
    ];
  }
  async createStaff(user: AuthenticatedUser, b: OpsStaffInput, actor: Actor) {
    await this.depot(user, b.depotId, "staff:write");
    const id = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { email: b.email.toLowerCase() } });
      if (existing?.deletedAt)
        throw new AppError("FORBIDDEN", "Deleted users cannot receive staff roles");
      const person =
        existing ??
        (await tx.user.create({ data: { email: b.email.toLowerCase(), name: b.name } }));
      if (!(await tx.userRole.findFirst({ where: { userId: person.id, role: "CITIZEN" } })))
        await tx.userRole.create({ data: { userId: person.id, role: "CITIZEN" } });
      if (await tx.userRole.findFirst({ where: { userId: person.id, role: b.type } }))
        throw new AppError("VALIDATION_FAILED", "User already has this staff role");
      await tx.userRole.create({ data: { userId: person.id, role: b.type, depotId: b.depotId } });
      const data = { userId: person.id, depotId: b.depotId, employeeCode: b.employeeCode };
      return b.type === "DRIVER"
        ? (await tx.driver.create({ data: { ...data, licenseNo: b.licenseNo! } })).id
        : (await tx.conductor.create({ data })).id;
    });
    await this.log(actor, "role.grant", b.type.toLowerCase(), id, {
      role: b.type,
      depotId: b.depotId,
    });
    return (await this.staff(user, { depotId: b.depotId, type: b.type })).find((s) => s.id === id)!;
  }
  async devices(user: AuthenticatedUser, q: OpsQuery) {
    if (q.depotId) await this.depot(user, q.depotId);
    if (q.status && !["PENDING", "APPROVED", "REVOKED"].includes(q.status))
      throw new AppError("VALIDATION_FAILED", "Unknown device status");
    const where: Prisma.DeviceWhereInput = {
      user: { driver: { depot: this.scope(user, "ops:read", q.depotId) } },
      ...(q.status === "REVOKED"
        ? { revokedAt: { not: null } }
        : q.status === "APPROVED"
          ? { approvedAt: { not: null }, revokedAt: null }
          : q.status === "PENDING"
            ? { approvedAt: null, revokedAt: null }
            : {}),
    };
    return this.prisma.device
      .findMany({
        where,
        select: {
          id: true,
          userId: true,
          label: true,
          approvedAt: true,
          approvedById: true,
          revokedAt: true,
        },
      })
      .then((rows) =>
        rows.map((d) => ({
          ...d,
          approvedAt: d.approvedAt?.toISOString() ?? null,
          revokedAt: d.revokedAt?.toISOString() ?? null,
        })),
      );
  }
  async device(user: AuthenticatedUser, id: string, actor: Actor, revoke = false) {
    const device = await this.prisma.device.findUnique({
      where: { id },
      include: { user: { include: { driver: true } } },
    });
    if (!device?.user.driver) throw new AppError("NOT_FOUND", "Driver device not found");
    await this.depot(user, device.user.driver.depotId, "device:approve");
    if (!revoke && device.revokedAt)
      throw new AppError("DEVICE_NOT_APPROVED", "A revoked device must be registered again");
    const row = await this.prisma.device.update({
      where: { id },
      data: revoke ? { revokedAt: new Date() } : { approvedAt: new Date(), approvedById: user.id },
    });
    await this.log(actor, revoke ? "device.revoke" : "device.approve", "device", id, {
      depotId: device.user.driver.depotId,
      userId: row.userId,
    });
    return {
      id: row.id,
      userId: row.userId,
      label: row.label,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      approvedById: row.approvedById,
      revokedAt: row.revokedAt?.toISOString() ?? null,
    };
  }
  async incidents(user: AuthenticatedUser, q: OpsQuery) {
    if (q.depotId) await this.depot(user, q.depotId);
    const status = statusFilter(IncidentStatus, q.status);
    return (
      await this.prisma.incident.findMany({
        where: { trip: { route: { depot: this.scope(user, "ops:read", q.depotId) } }, status },
        include: { bus: { select: { regNo: true } }, trip: { select: { code: true } } },
        orderBy: { createdAt: "desc" },
      })
    ).map(i => ({ ...incidentDto(i), busRegNo: i.bus?.regNo, tripCode: i.trip?.code }));
  }
  async incident(user: AuthenticatedUser, id: string, actor: Actor, note?: string) {
    const row = await this.prisma.incident.findUnique({ where: { id } });
    if (!row) throw new AppError("NOT_FOUND", "Incident not found");
    const trip = await this.trip(user, row.tripId, "incident:manage");
    const updated = await this.prisma.$transaction(async (tx) => {
      // Lock the trip to serialize multiple simultaneous incident resolutions.
      await tx.trip.update({ where: { id: trip.id }, data: { updatedAt: new Date() } });
      const i = await tx.incident.findUniqueOrThrow({ where: { id } });
      if (i.status === "RESOLVED" || (!note && i.status === "ACKNOWLEDGED")) return i;
      const result = await tx.incident.update({
        where: { id },
        data: note
          ? { status: "RESOLVED", resolvedAt: new Date(), resolutionNote: note }
          : { status: "ACKNOWLEDGED", acknowledgedAt: new Date(), acknowledgedById: user.id },
      });
      if (note) {
        const open = await tx.incident.count({
          where: { tripId: trip.id, status: { not: "RESOLVED" } },
        });
        await tx.trip.update({ where: { id: trip.id }, data: { hasOpenIncident: open > 0 } });
        const busOpen = await tx.incident.count({
          where: {
            busId: row.busId,
            status: { not: "RESOLVED" },
            type: { in: ["BREAKDOWN", "ACCIDENT", "BUS_PROBLEM"] },
          },
        });
        if (!busOpen) {
          const running = await tx.tripAssignment.count({
            where: { busId: row.busId, endedAt: null, trip: { status: "RUNNING" } },
          });
          const maintenance = await tx.maintenanceRecord.count({
            where: {
              busId: row.busId,
              startAt: { lte: new Date() },
              OR: [{ endAt: null }, { endAt: { gt: new Date() } }],
            },
          });
          await tx.bus.update({
            where: { id: row.busId },
            data: { status: maintenance ? "MAINTENANCE" : running ? "RUNNING" : "IDLE" },
          });
        }
      }
      return result;
    });
    await this.log(actor, note ? "incident.resolve" : "incident.acknowledge", "incident", id, {
      depotId: trip.route.depotId,
      status: updated.status,
      ...(note ? { note } : {}),
    });
    this.events.publish("incident.updated", {
      ...incidentDto(updated),
      rooms: {
        tripId: trip.id,
        routeId: trip.routeId,
        depotId: trip.route.depotId,
        districtId: trip.route.depot.districtId,
      },
    });
    this.publishTrip(await this.trip(user, trip.id, "incident:manage"));
    return incidentDto(updated);
  }
}
