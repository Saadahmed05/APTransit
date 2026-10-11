import {
  canMoveComplaint,
  type ComplaintDto,
  type ComplaintStatus,
  emailText,
  type FeedbackInput,
  type FeedbackStatusDto,
  generateComplaintCode,
  type UpdateComplaintInput,
} from "@aptransit/shared";
import { Injectable } from "@nestjs/common";
import type { AuthenticatedUser } from "../../common/auth/auth.types";
import { AppError } from "../../common/errors/app-error";
import { depotScopeWhere, isPlatformWide, wholeStates } from "../../common/services/scope.service";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService, type LogAuditParams } from "../audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";

type Actor = Pick<LogAuditParams, "actorUserId" | "actorRole" | "ip" | "userAgent">;
type Locale = "en" | "te";

const complaintInclude = {
  depot: { select: { nameEn: true, nameTe: true } },
} as const satisfies Prisma.ComplaintInclude;
type ComplaintRow = Prisma.ComplaintGetPayload<{ include: typeof complaintInclude }>;

const NOT_FOUND_MESSAGE = "No complaint matches this code and email";

/** Bus numbers are typed in many ways ("ap39z0101", "AP 39 Z 0101"): compare without spaces. */
export const normaliseRegNo = (value: string) => value.replace(/\s+/g, "").toUpperCase();

/**
 * Feedback and complaints (docs/06 Feedback and ops complaints, plan sec 40, 41). Public intake
 * never says whether an email or account exists. Staff move a complaint one step at a time.
 */
@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** POST /feedback: stores the complaint, finds its depot from the trip details, emails the code. */
  async create(input: FeedbackInput, user: AuthenticatedUser | undefined, locale: Locale): Promise<{ code: string }> {
    const depotId = await this.depotFor(input);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const row = await this.prisma.complaint.create({
          data: {
            code: generateComplaintCode(),
            userId: user?.id ?? null,
            email: input.email,
            category: input.category,
            message: input.message,
            ticketCode: input.ticketCode ?? null,
            busRegNo: input.busRegNo ?? null,
            routeCode: input.routeCode ?? null,
            travelDate: input.travelDate ? new Date(`${input.travelDate}T00:00:00.000Z`) : null,
            status: "RECEIVED",
            depotId,
          },
          select: { id: true, code: true, status: true },
        });
        await this.notifications.queueComplaintEmail({ complaintId: row.id, kind: "RECEIVED", locale }, row.status);
        return { code: row.code };
      } catch (err) {
        // A code collision (one in a billion) gets a new code; anything else is a real error
        if ((err as { code?: string }).code !== "P2002") throw err;
      }
    }
    throw new AppError("INTERNAL", "Could not create a complaint code");
  }

  /** GET /feedback/mine */
  async mine(userId: string): Promise<ComplaintDto[]> {
    const rows = await this.prisma.complaint.findMany({
      where: { userId },
      include: complaintInclude,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return this.toDtos(rows);
  }

  /** GET /feedback/status: code and email must both match. */
  async status(code: string, email: string): Promise<FeedbackStatusDto> {
    const row = await this.prisma.complaint.findUnique({ where: { code } });
    if (!row || row.email.toLowerCase() !== email.toLowerCase()) throw new AppError("NOT_FOUND", NOT_FOUND_MESSAGE);
    return {
      code: row.code,
      status: row.status,
      category: row.category,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      resolutionNote: row.resolutionNote,
    };
  }

  /** GET /ops/complaints: complaints of depots in the caller's complaint:manage scope, newest first. */
  async list(user: AuthenticatedUser, status?: ComplaintStatus, depotId?: string): Promise<ComplaintDto[]> {
    const rows = await this.prisma.complaint.findMany({
      where: {
        ...this.scopeWhere(user),
        ...(status ? { status } : {}),
        ...(depotId ? { depotId } : {}),
      },
      include: complaintInclude,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return this.toDtos(rows);
  }

  /** PATCH /ops/complaints/:id: one step forward at a time, a note to resolve, optional assignee. */
  async update(user: AuthenticatedUser, id: string, input: UpdateComplaintInput, actor: Actor): Promise<ComplaintDto> {
    const before = await this.prisma.complaint.findFirst({ where: { id, ...this.scopeWhere(user) }, include: complaintInclude });
    if (!before) throw new AppError("NOT_FOUND", "Complaint not found");
    const next = input.status ?? before.status;
    if (!canMoveComplaint(before.status, next)) {
      throw new AppError("COMPLAINT_STATUS_INVALID", `A ${before.status} complaint cannot move to ${next}`, {
        from: before.status,
        to: next,
      });
    }
    if (input.assignedToId) await this.assertAssignee(input.assignedToId, before.depotId);

    const statusChanged = next !== before.status;
    const after = await this.prisma.complaint.update({
      where: { id },
      data: {
        status: next,
        ...(input.resolutionNote !== undefined ? { resolutionNote: input.resolutionNote } : {}),
        ...(input.assignedToId !== undefined ? { assignedToId: input.assignedToId } : {}),
        ...(statusChanged && next === "RESOLVED" ? { resolvedAt: new Date() } : {}),
      },
      include: complaintInclude,
    });
    await this.audit.log({
      action: "complaint.update",
      entityType: "complaint",
      entityId: id,
      before: { status: before.status, resolutionNote: before.resolutionNote, assignedToId: before.assignedToId, depotId: before.depotId },
      after: { status: after.status, resolutionNote: after.resolutionNote, assignedToId: after.assignedToId, depotId: after.depotId },
      ...actor,
    });

    if (statusChanged) await this.tellCitizen(after);
    return (await this.toDtos([after]))[0]!;
  }

  /** In app plus account email for a signed in sender; an email to the given address for a guest. */
  private async tellCitizen(row: ComplaintRow): Promise<void> {
    if (row.userId) {
      await this.notifications.notify(
        row.userId,
        "COMPLAINT_UPDATE",
        {
          code: row.code,
          statusEn: emailText("en", `complaint.status.${row.status}`),
          statusTe: emailText("te", `complaint.status.${row.status}`),
        },
        `/feedback/status?code=${row.code}`,
        `complaint:${row.id}:${row.status}`,
      );
      return;
    }
    await this.notifications.queueComplaintEmail({ complaintId: row.id, kind: "UPDATE", locale: "en" }, row.status);
  }

  /** Depot of the ticket's route, else the bus, else the route (first match wins). */
  private async depotFor(input: FeedbackInput): Promise<string | null> {
    if (input.ticketCode) {
      const ticket = await this.prisma.ticket.findUnique({
        where: { code: input.ticketCode },
        select: { route: { select: { depotId: true } } },
      });
      if (ticket) return ticket.route.depotId;
    }
    if (input.busRegNo) {
      const wanted = normaliseRegNo(input.busRegNo);
      const buses = await this.prisma.bus.findMany({ select: { regNo: true, depotId: true } });
      const bus = buses.find((b) => normaliseRegNo(b.regNo) === wanted);
      if (bus) return bus.depotId;
    }
    if (input.routeCode) {
      const route = await this.prisma.route.findUnique({ where: { code: input.routeCode }, select: { depotId: true } });
      if (route) return route.depotId;
    }
    return null;
  }

  /**
   * Depot scope for complaint:manage. Complaints without a depot have no place, so state and
   * platform roles see them; depot and district roles do not.
   */
  private scopeWhere(user: AuthenticatedUser): Prisma.ComplaintWhereInput {
    const depots = depotScopeWhere(user, "complaint:manage");
    if (isPlatformWide(user, "complaint:manage")) return {};
    if (wholeStates(user, "complaint:manage")?.length) return { OR: [{ depot: depots }, { depotId: null }] };
    return { depot: depots };
  }

  /** The assignee must hold complaint:manage for the complaint's depot (or statewide). */
  private async assertAssignee(userId: string, depotId: string | null): Promise<void> {
    const roles = await this.prisma.userRole.findMany({ where: { userId }, select: { role: true, depotId: true, districtId: true, stateId: true } });
    const assignee: AuthenticatedUser = { id: userId, roles };
    let allowed = false;
    try {
      if (isPlatformWide(assignee, "complaint:manage")) allowed = true;
      else if (!depotId) allowed = Boolean(wholeStates(assignee, "complaint:manage")?.length);
      else {
        allowed = (await this.prisma.depot.count({ where: { AND: [depotScopeWhere(assignee, "complaint:manage"), { id: depotId }] } })) > 0;
      }
    } catch {
      allowed = false;
    }
    if (!allowed) throw new AppError("VALIDATION_FAILED", "This person cannot handle complaints for this depot", { field: "assignedToId" });
  }

  private async toDtos(rows: ComplaintRow[]): Promise<ComplaintDto[]> {
    const ids = [...new Set(rows.map((r) => r.assignedToId).filter((v): v is string => Boolean(v)))];
    const names = new Map(
      (ids.length ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : []).map((u) => [u.id, u.name]),
    );
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      email: r.email,
      category: r.category,
      status: r.status,
      message: r.message,
      ticketCode: r.ticketCode,
      busRegNo: r.busRegNo,
      routeCode: r.routeCode,
      travelDate: r.travelDate ? r.travelDate.toISOString().slice(0, 10) : null,
      depotId: r.depotId,
      depotNameEn: r.depot?.nameEn ?? null,
      depotNameTe: r.depot?.nameTe ?? null,
      assignedToId: r.assignedToId,
      assignedToName: r.assignedToId ? (names.get(r.assignedToId) ?? null) : null,
      resolutionNote: r.resolutionNote,
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }
}
