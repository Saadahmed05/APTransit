import type { TicketStatus } from "@aptransit/shared";
import { Injectable, Logger } from "@nestjs/common";
import { DomainEventsService } from "../../common/events/domain-events.service";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PASS_EXPIRING_NOTICE_HOURS, PASS_PAYMENT_ABANDON_MINUTES, PASS_SETTING_DEFAULTS } from "../passes/pass-rules";

const MS_PER_MIN = 60_000;
const MS_PER_DAY = 24 * 60 * MS_PER_MIN;
/** Rows per update. A run loops until a batch comes back short. */
export const EXPIRY_BATCH = 500;

export interface ExpiryCounts {
  ticketsBookedExpired: number;
  ticketsActiveExpired: number;
  ticketsScannedUsed: number;
  passesReadyExpired: number;
  passesActiveExpired: number;
  passesExpiringNotified: number;
  passesPendingCancelled: number;
}

/**
 * The system transitions of docs/07 sections 2 and 8, run every 5 min on the expiry queue. Each
 * rule is one query for a batch of ids, then one conditional update (the status in the where is
 * the optimistic lock: a row that moved on in between is simply not counted). System transitions
 * are not audited; counts are logged. Ticket changes publish ticket.status like every other change.
 */
@Injectable()
export class StatusExpiryService {
  private readonly logger = new Logger(StatusExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly notifications: NotificationsService,
  ) {}

  async runAll(now = new Date()): Promise<ExpiryCounts> {
    const counts: ExpiryCounts = {
      // a. BOOKED whose activation window closed (tickets.expiresAt is the window close)
      ticketsBookedExpired: await this.moveTickets({ status: "BOOKED", expiresAt: { lt: now } }, "BOOKED", "EXPIRED", {}),
      // b. ACTIVE past validUntil and never scanned
      ticketsActiveExpired: await this.moveTickets({ status: "ACTIVE", validUntil: { lt: now }, scannedAt: null }, "ACTIVE", "EXPIRED", {}),
      // c. SCANNED past validUntil, or whose trip completed
      ticketsScannedUsed: await this.moveTickets(
        { status: "SCANNED", OR: [{ validUntil: { lt: now } }, { trip: { status: "COMPLETED" } }] },
        "SCANNED",
        "USED",
        { usedAt: now },
      ),
      // d. READY passes not activated in time, ACTIVE passes past validUntil
      passesReadyExpired: await this.movePasses(
        { status: "READY", createdAt: { lt: new Date(now.getTime() - (await this.activateWithinDays()) * MS_PER_DAY) } },
        "READY",
        "EXPIRED",
      ),
      passesActiveExpired: await this.movePasses({ status: "ACTIVE", validUntil: { lt: now } }, "ACTIVE", "EXPIRED"),
      // e. PASS_EXPIRING once, 24 h before validUntil
      passesExpiringNotified: await this.notifyExpiringPasses(now),
      // f. Unpaid passes abandoned for 30 min
      passesPendingCancelled: await this.movePasses(
        { status: "PENDING_PAYMENT", createdAt: { lt: new Date(now.getTime() - PASS_PAYMENT_ABANDON_MINUTES * MS_PER_MIN) } },
        "PENDING_PAYMENT",
        "CANCELLED",
      ),
    };
    const changed = Object.values(counts).reduce((sum, n) => sum + n, 0);
    if (changed > 0) this.logger.log({ counts }, `Status expiry moved ${changed} rows`);
    return counts;
  }

  private async moveTickets(
    where: Prisma.TicketWhereInput,
    from: TicketStatus,
    to: TicketStatus,
    extra: Prisma.TicketUpdateManyMutationInput,
  ): Promise<number> {
    let moved = 0;
    for (;;) {
      const batch = await this.prisma.ticket.findMany({ where, select: { id: true, holderUserId: true }, take: EXPIRY_BATCH });
      if (batch.length === 0) break;
      const { count } = await this.prisma.ticket.updateMany({
        where: { id: { in: batch.map((t) => t.id) }, status: from },
        data: { status: to, version: { increment: 1 }, ...extra },
      });
      moved += count;
      for (const t of batch) this.events.publish("ticket.status", { ticketId: t.id, holderUserId: t.holderUserId, from, to });
      if (batch.length < EXPIRY_BATCH || count === 0) break;
    }
    return moved;
  }

  private async movePasses(where: Prisma.PassWhereInput, from: "READY" | "ACTIVE" | "PENDING_PAYMENT", to: "EXPIRED" | "CANCELLED"): Promise<number> {
    let moved = 0;
    for (;;) {
      const batch = await this.prisma.pass.findMany({ where, select: { id: true }, take: EXPIRY_BATCH });
      if (batch.length === 0) break;
      const { count } = await this.prisma.pass.updateMany({ where: { id: { in: batch.map((p) => p.id) }, status: from }, data: { status: to } });
      moved += count;
      if (batch.length < EXPIRY_BATCH || count === 0) break;
    }
    return moved;
  }

  /** The notification link carries the pass id, so "once" is a lookup on (user, type, link). */
  private async notifyExpiringPasses(now: Date): Promise<number> {
    const soon = new Date(now.getTime() + PASS_EXPIRING_NOTICE_HOURS * 60 * MS_PER_MIN);
    const passes = await this.prisma.pass.findMany({
      where: { status: "ACTIVE", validUntil: { gt: now, lte: soon } },
      include: { passType: { select: { nameEn: true, nameTe: true } } },
      take: EXPIRY_BATCH,
    });
    let sent = 0;
    for (const pass of passes) {
      const link = `/passes?pass=${pass.id}`;
      const already = await this.prisma.notification.count({ where: { userId: pass.userId, type: "PASS_EXPIRING", link } });
      if (already > 0 || !pass.validUntil) continue;
      await this.notifications.notify(
        pass.userId,
        "PASS_EXPIRING",
        { passNameEn: pass.passType.nameEn, passNameTe: pass.passType.nameTe, validUntil: pass.validUntil.toISOString() },
        link,
      );
      sent++;
    }
    return sent;
  }

  private async activateWithinDays(): Promise<number> {
    try {
      const row = await this.prisma.setting.findUnique({ where: { key: "pass.activateWithinDays" }, select: { value: true } });
      return typeof row?.value === "number" ? row.value : PASS_SETTING_DEFAULTS["pass.activateWithinDays"];
    } catch {
      return PASS_SETTING_DEFAULTS["pass.activateWithinDays"];
    }
  }
}
