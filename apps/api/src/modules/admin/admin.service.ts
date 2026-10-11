import {
  can,
  encodePolyline,
  type Coordinate,
  type AdminQuery,
  type AdminStopInput,
  type AdminStopPatch,
  type AdminRouteInput,
  type AdminRoutePatch,
  type AdminTimetableInput,
  type AdminTimetablePatch,
  type GenerateTripsInput,
  type GrantRoleInput,
  type AdminFareInput,
  type AdminPassTypeInput,
  type AdminPassTypePatch,
  type AdminRefundInput,
  type AdminSettingsInput,
  AdminTimetableInput as TimetableSchema,
} from "@aptransit/shared";
import { Injectable } from "@nestjs/common";
import type { AuthenticatedUser } from "../../common/auth/auth.types";
import { AppError } from "../../common/errors/app-error";
import { depotScopeWhere, isPlatformWide, wholeStates } from "../../common/services/scope.service";
import { PrismaService } from "../../prisma/prisma.service";
import { Prisma } from "../../generated/prisma/client";
import type { LogAuditParams } from "../audit/audit.service";
import { NetworkService } from "../network/network.service";
import { TripGeneratorService } from "../trips/trip-generator.service";
type Actor = Pick<LogAuditParams, "actorUserId" | "actorRole" | "ip" | "userAgent">;
type Tx = Prisma.TransactionClient;
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
const timetableDto = (row: { validFrom: Date; validTo: Date | null }) => ({
  ...row,
  validFrom: row.validFrom.toISOString(),
  validTo: row.validTo?.toISOString() ?? null,
});
const routeInclude = { routeStops: { orderBy: { seq: "asc" as const } } };
const routeDto = (row: Prisma.RouteGetPayload<{ include: typeof routeInclude }>) => ({
  ...row,
  stops: row.routeStops.map((s) => ({
    stopId: s.stopId,
    kmFromOrigin: s.kmFromOrigin,
    minutesFromOrigin: s.minutesFromOrigin,
    isBoarding: s.isBoarding,
    isDropping: s.isDropping,
  })),
});
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generator: TripGeneratorService,
    private readonly network: NetworkService,
  ) {}
  private async write<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    for (let i = 0; i < 3; i++) {
      try {
        const result = await this.prisma.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
        this.network.invalidateAdminChanges();
        return result;
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === "P2034" && i < 2) continue;
        if (code === "P2002" || code === "P2003")
          throw new AppError("VALIDATION_FAILED", "Duplicate code or invalid reference");
        if (code === "P2025") throw new AppError("NOT_FOUND", "Record not found");
        throw error;
      }
    }
    throw new AppError("VALIDATION_FAILED", "Concurrent change, retry");
  }
  private async audit(
    tx: Tx,
    actor: Actor,
    action: string,
    entityType: string,
    entityId: string,
    before: unknown,
    after: unknown,
  ) {
    await tx.auditLog.create({
      data: {
        ...actor,
        action,
        entityType,
        entityId,
        before: before === null ? Prisma.JsonNull : json(before),
        after: after === null ? Prisma.JsonNull : json(after),
      },
    });
  }
  private async stopReferences(tx: Tx, b: AdminStopInput) {
    const district = await tx.district.findUnique({ where: { id: b.districtId } });
    if (!district) throw new AppError("VALIDATION_FAILED", "District not found");
    if (b.busStandId) {
      const stand = await tx.busStand.findUnique({ where: { id: b.busStandId } });
      if (!stand || stand.districtId !== b.districtId)
        throw new AppError("VALIDATION_FAILED", "Bus stand must belong to district");
    }
  }
  async getStop(id:string) { const row=await this.prisma.stop.findUnique({where:{id}});if(!row)throw new AppError("NOT_FOUND","Stop not found");return row; }
  async getRoute(id:string) { const row=await this.prisma.route.findUnique({where:{id},include:routeInclude});if(!row)throw new AppError("NOT_FOUND","Route not found");return routeDto(row); }
  async getTimetable(id:string) { const row=await this.prisma.timetable.findUnique({where:{id}});if(!row)throw new AppError("NOT_FOUND","Timetable not found");return timetableDto(row); }
  async stops(q: AdminQuery) {
    return this.prisma.stop.findMany({
      where: q.q
        ? {
            OR: [
              { code: { contains: q.q, mode: "insensitive" } },
              { nameEn: { contains: q.q, mode: "insensitive" } },
              { nameTe: { contains: q.q } },
            ],
          }
        : {},
      orderBy: { code: "asc" },
    });
  }
  async saveStop(id: string | undefined, b: AdminStopInput | AdminStopPatch, actor: Actor) {
    return this.write(async (tx) => {
      const before = id ? await tx.stop.findUniqueOrThrow({ where: { id } }) : null;
      const merged = { ...before, ...b } as AdminStopInput;
      await this.stopReferences(tx, merged);
      const row = id
        ? await tx.stop.update({ where: { id }, data: b })
        : await tx.stop.create({ data: b as AdminStopInput });
      await this.audit(tx, actor, "network.update", "stop", row.id, before, row);
      return row;
    });
  }
  async routes(q: AdminQuery) {
    const rows = await this.prisma.route.findMany({
      where: q.q
        ? {
            OR: [
              { code: { contains: q.q, mode: "insensitive" } },
              { nameEn: { contains: q.q, mode: "insensitive" } },
            ],
          }
        : {},
      include: routeInclude,
      orderBy: { code: "asc" },
    });
    return rows.map(routeDto);
  }
  async saveRoute(id: string | undefined, b: AdminRouteInput | AdminRoutePatch, actor: Actor) {
    return this.write(async (tx) => {
      const before = id
        ? await tx.route.findUniqueOrThrow({ where: { id }, include: routeInclude })
        : null;
      const depotId = b.depotId ?? before?.depotId;
      if (!depotId || !(await tx.depot.findUnique({ where: { id: depotId } })))
        throw new AppError("VALIDATION_FAILED", "Depot not found");
      let geometry:
        | { originStopId: string; destinationStopId: string; distanceKm: number; polyline: string }
        | undefined;
      if (b.stops) {
        const ids = b.stops.map((s) => s.stopId),
          stops = await tx.stop.findMany({ where: { id: { in: ids } } });
        if (stops.length !== ids.length)
          throw new AppError("VALIDATION_FAILED", "Unknown route stop");
        const removed =
          before?.routeStops.filter((s) => !ids.includes(s.stopId)).map((s) => s.stopId) ?? [];
        if (
          id &&
          removed.length &&
          (await tx.ticket.count({
            where: {
              routeId: id,
              status: { in: ["BOOKED", "ACTIVE"] },
              trip: { scheduledDepartureAt: { gte: new Date() } },
              OR: [{ boardingStopId: { in: removed } }, { droppingStopId: { in: removed } }],
            },
          }))
        )
          throw new AppError(
            "VALIDATION_FAILED",
            "A removed stop is used by booked or active future tickets",
          );
        const coords = ids.map((stopId) => {
          const s = stops.find((s) => s.id === stopId)!;
          return [s.lat, s.lng] as Coordinate;
        });
        geometry = {
          originStopId: ids[0]!,
          destinationStopId: ids.at(-1)!,
          distanceKm: b.stops.at(-1)!.kmFromOrigin,
          polyline: encodePolyline(coords),
        };
      }
      const { stops: ordered, ...fields } = b;
      const row = id
        ? await tx.route.update({ where: { id }, data: { ...fields, ...geometry } })
        : await tx.route.create({
            data: { ...fields, ...geometry } as Prisma.RouteUncheckedCreateInput,
          });
      if (ordered) {
        await tx.routeStop.deleteMany({ where: { routeId: row.id } });
        await tx.routeStop.createMany({
          data: ordered.map((s, seq) => ({ ...s, routeId: row.id, seq })),
        });
      }
      const after = await tx.route.findUniqueOrThrow({
        where: { id: row.id },
        include: routeInclude,
      });
      await this.audit(tx, actor, "network.update", "route", row.id, before, after);
      return routeDto(after);
    });
  }
  async timetables() {
    return (await this.prisma.timetable.findMany({ orderBy: { departureLocal: "asc" } })).map(
      timetableDto,
    );
  }
  async saveTimetable(
    id: string | undefined,
    b: AdminTimetableInput | AdminTimetablePatch,
    actor: Actor,
  ) {
    return this.write(async (tx) => {
      const before = id ? await tx.timetable.findUniqueOrThrow({ where: { id } }) : null;
      const raw = { ...(before ? timetableDto(before) : {}), ...b } as AdminTimetableInput;
      const { routeId, busTypeId, departureLocal, daysMask, validFrom, validTo, isActive } = raw;
      const parsed = TimetableSchema.safeParse({
        routeId,
        busTypeId,
        departureLocal,
        daysMask,
        validFrom,
        validTo,
        isActive,
      });
      if (!parsed.success) throw new AppError("VALIDATION_FAILED", "Invalid timetable");
      const body = parsed.data;
      if (
        !(await tx.route.findUnique({ where: { id: body.routeId } })) ||
        !(await tx.busType.findUnique({ where: { id: body.busTypeId } }))
      )
        throw new AppError("VALIDATION_FAILED", "Unknown route or bus type");
      const data = {
        ...body,
        validFrom: new Date(body.validFrom),
        validTo: body.validTo ? new Date(body.validTo) : null,
      };
      const row = id
        ? await tx.timetable.update({ where: { id }, data })
        : await tx.timetable.create({ data });
      await this.audit(tx, actor, "network.update", "timetable", row.id, before, row);
      return timetableDto(row);
    });
  }
  async generate(b: GenerateTripsInput, actor: Actor) {
    return this.write(async (tx) => {
      const count = await this.generator.generateRange(b.from, b.to, tx);
      await this.audit(tx, actor, "network.update", "trip_generation", b.from + ":" + b.to, null, {
        ...b,
        count,
      });
      return { count };
    });
  }
  async users(q: AdminQuery) {
    const rows = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        ...(q.role ? { userRoles: { some: { role: q.role } } } : {}),
        ...(q.q
          ? {
              OR: [
                { email: { contains: q.q, mode: "insensitive" } },
                { name: { contains: q.q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { userRoles: true },
      orderBy: { id: "asc" },
    });
    return rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone ? "******" + u.phone.slice(-4) : null,
      roles: u.userRoles,
    }));
  }
  private adminRole(user: AuthenticatedUser, role: string) {
    if (
      ["STATE_ADMIN", "SUPER_ADMIN"].includes(role) &&
      !can(
        user.roles.map((r) => r.role),
        "user:roles:admin",
      )
    )
      throw new AppError("FORBIDDEN", "Only a super admin can change admin roles");
  }
  async grant(user: AuthenticatedUser, userId: string, b: GrantRoleInput, actor: Actor) {
    this.adminRole(user, b.role);
    return this.write(async (tx) => {
      await tx.user.update({
        where: { id: userId, deletedAt: null },
        data: { updatedAt: new Date() },
      });
      if (b.depotId && !(await tx.depot.findUnique({ where: { id: b.depotId } })))
        throw new AppError("VALIDATION_FAILED", "Depot not found");
      if (b.districtId && !(await tx.district.findUnique({ where: { id: b.districtId } })))
        throw new AppError("VALIDATION_FAILED", "District not found");
      if (b.stateId && !(await tx.state.findUnique({ where: { id: b.stateId } })))
        throw new AppError("VALIDATION_FAILED", "State not found");
      await this.assertGrantScope(tx, user, b);
      const data = {
        userId,
        role: b.role,
        depotId: b.depotId ?? null,
        districtId: b.districtId ?? null,
        stateId: b.stateId ?? null,
      };
      const existing = await tx.userRole.findFirst({ where: data });
      if (existing) return existing;
      const row = await tx.userRole.create({ data });
      await this.audit(tx, actor, "role.grant", "user_role", row.id, null, row);
      return row;
    });
  }
  /** A state admin grants roles only inside their own state (D-034); SUPER_ADMIN anywhere. */
  private async assertGrantScope(tx: Prisma.TransactionClient, user: AuthenticatedUser, b: GrantRoleInput) {
    if (isPlatformWide(user, "user:roles")) return;
    const states = wholeStates(user, "user:roles") ?? [];
    const inScope = b.stateId
      ? states.includes(b.stateId)
      : b.districtId
        ? (await tx.district.count({ where: { id: b.districtId, stateId: { in: states } } })) > 0
        : b.depotId
          ? (await tx.depot.count({ where: { AND: [depotScopeWhere(user, "user:roles"), { id: b.depotId }] } })) > 0
          : true;
    if (!inScope) throw new AppError("FORBIDDEN", "This place is outside your state");
  }
  async revoke(user: AuthenticatedUser, userId: string, roleId: string, actor: Actor) {
    return this.write(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { updatedAt: new Date() } });
      const row = await tx.userRole.findFirst({ where: { id: roleId, userId } });
      if (!row) throw new AppError("NOT_FOUND", "Role not found");
      this.adminRole(user, row.role);
      if (row.role === "CITIZEN")
        throw new AppError("FORBIDDEN", "Every user retains the citizen role");
      if (
        user.id === userId &&
        ["STATE_ADMIN", "SUPER_ADMIN"].includes(row.role) &&
        (await tx.userRole.count({
          where: { userId, role: { in: ["STATE_ADMIN", "SUPER_ADMIN"] } },
        })) <= 1
      )
        throw new AppError("FORBIDDEN", "Cannot remove your last admin role");
      await tx.userRole.delete({ where: { id: roleId } });
      await this.audit(tx, actor, "role.revoke", "user_role", roleId, row, null);
      return row;
    });
  }
  async fares() {
    return (await this.prisma.fareRule.findMany({ orderBy: { validFrom: "desc" } })).map(
      timetableDto,
    );
  }
  async fare(b: AdminFareInput, actor: Actor) {
    return this.write(async (tx) => {
      if (!(await tx.busType.findUnique({ where: { id: b.busTypeId } })))
        throw new AppError("VALIDATION_FAILED", "Bus type not found");
      const before = await tx.fareRule.findFirst({
        where: { busTypeId: b.busTypeId },
        orderBy: { validFrom: "desc" },
      });
      const row = await tx.fareRule.create({
        data: {
          ...b,
          validFrom: new Date(b.validFrom),
          validTo: b.validTo ? new Date(b.validTo) : null,
        },
      });
      await this.audit(tx, actor, "policy.update", "fare_rule", row.id, before, row);
      return timetableDto(row);
    });
  }
  /** GET /admin/pass-types (D-036): every type, with how many passes were sold of it. */
  async passTypes() {
    const rows = await this.prisma.passType.findMany({ orderBy: [{ sortOrder: "asc" }, { pricePaise: "asc" }] });
    return Promise.all(rows.map(async (row) => ({ ...row, soldCount: await this.soldCount(this.prisma, row.id) })));
  }
  async createPassType(b: AdminPassTypeInput, actor: Actor) {
    return this.write(async (tx) => {
      if (b.stateId && !(await tx.state.findUnique({ where: { id: b.stateId } })))
        throw new AppError("VALIDATION_FAILED", "State not found");
      const row = await tx.passType.create({ data: b });
      await this.audit(tx, actor, "pass_type.create", "pass_type", row.id, null, row);
      return { ...row, soldCount: 0 };
    });
  }
  /**
   * PATCH /admin/pass-types/:id. Applies to new sales only: every sold pass carries its own copy of
   * price, duration, mode, services and group size (D-036).
   */
  async updatePassType(id: string, b: AdminPassTypePatch, actor: Actor) {
    return this.write(async (tx) => {
      const before = await tx.passType.findUnique({ where: { id } });
      if (!before) throw new AppError("NOT_FOUND", "Pass type not found");
      const row = await tx.passType.update({ where: { id }, data: b });
      await this.audit(tx, actor, "pass_type.update", "pass_type", id, before, row);
      return { ...row, soldCount: await this.soldCount(tx, id) };
    });
  }
  private soldCount(db: Pick<Tx, "pass">, passTypeId: string) {
    return db.pass.count({ where: { passTypeId, status: { notIn: ["PENDING_PAYMENT", "CANCELLED"] } } });
  }
  async refunds() {
    return (await this.prisma.refundPolicy.findMany({ orderBy: { validFrom: "desc" } })).map(
      (r) => ({ ...r, validFrom: r.validFrom.toISOString() }),
    );
  }
  async refund(b: AdminRefundInput, actor: Actor) {
    return this.write(async (tx) => {
      const before = await tx.refundPolicy.findMany({ where: { isActive: true } });
      await tx.refundPolicy.updateMany({ where: { isActive: true }, data: { isActive: false } });
      const row = await tx.refundPolicy.create({
        data: { ...b, validFrom: new Date(b.validFrom), isActive: true, tiers: json(b.tiers) },
      });
      await this.audit(tx, actor, "policy.update", "refund_policy", row.id, before, row);
      return { ...row, validFrom: row.validFrom.toISOString() };
    });
  }
  settings() {
    return this.prisma.setting.findMany({ orderBy: { key: "asc" } });
  }
  async updateSettings(b: AdminSettingsInput, actor: Actor) {
    return this.write(async (tx) => {
      const result = [];
      for (const [key, value] of Object.entries(b)) {
        const before = await tx.setting.findUnique({ where: { key } });
        const row = await tx.setting.upsert({
          where: { key },
          create: { key, value: value!, updatedById: actor.actorUserId },
          update: { value: value!, updatedById: actor.actorUserId },
        });
        await this.audit(tx, actor, "settings.update", "setting", key, before, row);
        result.push(row);
      }
      return result;
    });
  }
  async auditLogs(user: AuthenticatedUser, q: AdminQuery) {
    const roles = user.roles.filter((r) => can([r.role], "audit:read"));
    const platform = isPlatformWide(user, "audit:read");
    const states = wholeStates(user, "audit:read") ?? [];
    const global = platform || states.length > 0;
    // A state role sees every entry except those about depots of another state (D-034)
    const foreignDepots = platform || !states.length ? [] : await this.prisma.depot.findMany({ where: { district: { stateId: { notIn: states } } }, select: { id: true } });
    const districtIds = roles.flatMap(r => r.districtId ? [r.districtId] : []);
    const districtDepots = global || !districtIds.length ? [] : await this.prisma.depot.findMany({ where: { districtId: { in: districtIds } }, select: { id: true } });
    const depotIds = [...new Set([...roles.flatMap(r => r.depotId ? [r.depotId] : []), ...districtDepots.map(d => d.id)])];
    // Scope the audited entity itself. An actor can hold roles in several depots.
    const byDepot = (ids: string[]) => ids.flatMap((id) => [
      { after: { path: ["depotId"], equals: id } },
      { before: { path: ["depotId"], equals: id } },
    ]);
    const scope: Prisma.AuditLogWhereInput = global
      ? foreignDepots.length ? { NOT: { OR: byDepot(foreignDepots.map((d) => d.id)) } } : {}
      : { OR: depotIds.flatMap(id => [
      { after: { path: ["depotId"], equals: id } },
      { before: { path: ["depotId"], equals: id } },
    ]) };
    const rows = await this.prisma.auditLog.findMany({
      where: {
        AND: [
          scope,
          {
            ...(q.entityType ? { entityType: q.entityType } : {}),
            ...(q.entityId ? { entityId: q.entityId } : {}),
            ...(q.actorId ? { actorUserId: q.actorId } : {}),
            ...(q.from || q.to
              ? {
                  createdAt: {
                    ...(q.from ? { gte: new Date(q.from) } : {}),
                    ...(q.to ? { lte: new Date(q.to) } : {}),
                  },
                }
              : {}),
          },
        ],
      },
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: q.limit + 1,
    });
    return {
      items: rows.slice(0, q.limit).map((r) => ({
        ...r,
        before: r.before ?? null,
        after: r.after ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      nextCursor: rows.length > q.limit ? rows[q.limit - 1]!.id : null,
    };
  }
}
