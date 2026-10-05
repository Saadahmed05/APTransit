import {
  type CancelTicketResult,
  deriveTripDisplayStatus,
  DEFAULT_REFUND_TIERS,
  formatIstDate,
  type RefundQuote,
  refundQuote,
  type RefundQuoteDto,
  RefundTiers,
  type TicketDto,
  type TicketQrDto,
  type TicketScope,
  type TicketStatus,
  type TicketSummaryDto,
  type TransferTicketResult,
  maskEmail,
  maskPhone,
  type NormalizedRecipient,
  QR_PERIOD_SEC,
} from "@aptransit/shared";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { AppError } from "../../common/errors/app-error";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { idempotencySlot, readIdempotent, writeIdempotent } from "../../common/services/idempotency";
import { PrismaService } from "../../prisma/prisma.service";
import { RedisService } from "../../redis/redis.service";
import { AuditService, type LogAuditParams } from "../audit/audit.service";
import { PAYMENT_PROVIDER, type PaymentProvider } from "../payments/payment-provider";
import { QrService } from "./qr.service";
import {
  activationWindow,
  canActivate,
  canCancel,
  canGift,
  computeValidUntil,
  isUpcoming,
  TICKET_SETTING_DEFAULTS,
  type TicketSettingKey,
  type TicketSettings,
} from "./ticket-rules";

type AuditActor = Pick<LogAuditParams, "actorUserId" | "actorRole" | "ip" | "userAgent">;

const MS_PER_MIN = 60_000;
const REFUND_REASON_HOLDER = "HOLDER_CANCELLED";

const TICKET_INCLUDE = {
  passenger: { select: { name: true } },
  boardingStop: { select: { id: true, nameEn: true, nameTe: true } },
  droppingStop: { select: { id: true, nameEn: true, nameTe: true } },
  refunds: { orderBy: { createdAt: "desc" as const }, take: 1, select: { amountPaise: true, status: true } },
  trip: {
    include: {
      busType: { select: { serviceType: true } },
      route: { include: { routeStops: { select: { stopId: true, minutesFromOrigin: true } } } },
      assignments: { where: { endedAt: null }, take: 1, include: { bus: { select: { regNo: true } } } },
    },
  },
};

interface LoadedTicket {
  id: string;
  code: string;
  bookingId: string | null;
  type: "SINGLE" | "FREE_TRAVEL";
  status: TicketStatus;
  holderUserId: string;
  tripId: string;
  seatNo: string | null;
  farePaise: number;
  activatedAt: Date | null;
  validUntil: Date | null;
  expiresAt: Date;
  qrSecret: string;
  giftable: boolean;
  transferCount: number;
  version: number;
  passengerId: string | null;
  boardingStopId: string;
  droppingStopId: string;
  passenger: { name: string } | null;
  boardingStop: { id: string; nameEn: string; nameTe: string };
  droppingStop: { id: string; nameEn: string; nameTe: string };
  refunds: { amountPaise: number; status: "PENDING" | "PROCESSED" | "FAILED" }[];
  trip: {
    id: string;
    status: "SCHEDULED" | "RUNNING" | "COMPLETED" | "CANCELLED";
    serviceDate: Date;
    scheduledDepartureAt: Date;
    delayMinutes: number;
    hasOpenIncident: boolean;
    busTypeId: string;
    busType: { serviceType: TicketSummaryDto["serviceType"] };
    route: { code: string; nameEn: string; nameTe: string; routeStops: { stopId: string; minutesFromOrigin: number }[] };
    assignments: { bus: { regNo: string } | null }[];
  };
}

/** Holder only ticket endpoints. Every rule comes from ticket-rules.ts or fare.ts. */
@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly events: DomainEventsService,
    private readonly qr: QrService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  async list(userId: string, scope: TicketScope, now = new Date()): Promise<TicketSummaryDto[]> {
    const tickets = (await this.prisma.ticket.findMany({
      where: { holderUserId: userId },
      include: TICKET_INCLUDE,
    })) as unknown as LoadedTicket[];
    const settings = await this.settings();
    const rows = tickets
      .filter((t) => isUpcoming(t, now) === (scope === "upcoming"))
      .map((t) => this.toSummary(t, settings));
    // Upcoming: soonest first. Past: most recent first.
    rows.sort((a, b) => (scope === "upcoming" ? 1 : -1) * a.departureAt.localeCompare(b.departureAt));
    return rows;
  }

  async get(userId: string, ticketId: string, now = new Date()): Promise<TicketDto> {
    const ticket = await this.load(userId, ticketId);
    return this.toDto(ticket, await this.settings(), now, await this.quote(ticket, now));
  }

  async refundQuote(userId: string, ticketId: string, now = new Date()): Promise<RefundQuoteDto> {
    const ticket = await this.load(userId, ticketId);
    const { quote, policyName } = await this.quote(ticket, now);
    return { cancellable: canCancel(ticket, quote.cancellable).ok, percent: quote.percent, amountPaise: quote.amountPaise, feePaise: quote.feePaise, policyName };
  }

  /** Token always; the rotating secret only while ACTIVE (ADR 003). */
  async qrFor(userId: string, ticketId: string, now = new Date()): Promise<TicketQrDto> {
    const ticket = await this.load(userId, ticketId);
    const validUntil = ticket.validUntil ?? ticket.expiresAt;
    const token = this.qr.signToken({
      t: "T",
      i: ticket.id,
      tr: ticket.tripId,
      d: formatIstDate(ticket.trip.serviceDate),
      v: Math.floor(validUntil.getTime() / 1000),
    });
    const rotSecret = ticket.status === "ACTIVE" ? this.qr.decryptRotSecret(ticket.qrSecret).toString("base64url") : null;
    return { token, rotSecret, periodSec: QR_PERIOD_SEC, serverTime: now.toISOString() };
  }

  async activate(userId: string, ticketId: string, idempotencyKey: string | undefined, actor: AuditActor, now = new Date()): Promise<TicketDto> {
    const slot = idempotencySlot("ticket-activate", userId, idempotencyKey, { ticketId });
    const cached = await readIdempotent<TicketDto>(this.redis.client, slot);
    if (cached) return cached;

    const ticket = await this.load(userId, ticketId);
    const settings = await this.settings();
    const times = this.times(ticket);
    const window = activationWindow(times.boarding, settings);
    const rule = canActivate(ticket, window, ticket.trip.status, now);
    if (!rule.ok) {
      // The web shows "You can activate from {time}" (docs/10)
      const details = rule.error === "ACTIVATION_WINDOW_CLOSED"
        ? { activationOpensAt: window.opensAt.toISOString(), activationClosesAt: window.closesAt.toISOString() }
        : undefined;
      throw new AppError(rule.error, this.message(rule.error), details);
    }

    const validUntil = computeValidUntil(times.droppingArrivalAt, ticket.trip.delayMinutes, settings["ticket.graceMinutesAfterArrival"]);
    // Optimistic lock: a second, parallel activate finds the version moved on
    const { count } = await this.prisma.ticket.updateMany({
      where: { id: ticket.id, status: "BOOKED", version: ticket.version },
      data: { status: "ACTIVE", activatedAt: now, validUntil, version: { increment: 1 } },
    });
    if (count !== 1) {
      const fresh = await this.load(userId, ticketId);
      throw fresh.status === "ACTIVE"
        ? new AppError("TICKET_ALREADY_ACTIVE", this.message("TICKET_ALREADY_ACTIVE"))
        : new AppError("TICKET_NOT_ACTIVATABLE", this.message("TICKET_NOT_ACTIVATABLE"));
    }

    await this.audit.log({
      action: "ticket.activate",
      entityType: "ticket",
      entityId: ticket.id,
      before: { status: "BOOKED" },
      after: { status: "ACTIVE", validUntil: validUntil.toISOString() },
      ...actor,
    });
    this.events.publish("ticket.status", { ticketId: ticket.id, holderUserId: ticket.holderUserId, from: "BOOKED", to: "ACTIVE" });

    const result = await this.get(userId, ticketId, now);
    await writeIdempotent(this.redis.client, slot, result);
    return result;
  }

  /** BOOKED to CANCELLED with a refund from the active policy (docs/07 section 6). */
  async cancel(userId: string, ticketId: string, actor: AuditActor, now = new Date()): Promise<CancelTicketResult> {
    const ticket = await this.load(userId, ticketId);
    const { quote, policyId } = await this.quote(ticket, now);
    const rule = canCancel(ticket, quote.cancellable);
    if (!rule.ok || !policyId) throw new AppError("TICKET_NOT_CANCELLABLE", this.message("TICKET_NOT_CANCELLABLE"));

    const payment = ticket.bookingId
      ? await this.prisma.payment.findFirst({
          where: { bookingId: ticket.bookingId, status: { in: ["CAPTURED", "PARTIALLY_REFUNDED"] }, providerPaymentId: { not: null } },
          orderBy: { capturedAt: "desc" },
        })
      : null;
    if (!payment?.providerPaymentId) throw new AppError("TICKET_NOT_CANCELLABLE", "No captured payment for this ticket");

    // Claim the ticket first, so a double cancel can never refund twice
    const { count } = await this.prisma.ticket.updateMany({
      where: { id: ticket.id, status: "BOOKED", version: ticket.version },
      data: { status: "CANCELLED", version: { increment: 1 } },
    });
    if (count !== 1) throw new AppError("TICKET_NOT_CANCELLABLE", this.message("TICKET_NOT_CANCELLABLE"));
    this.events.publish("ticket.status", { ticketId: ticket.id, holderUserId: ticket.holderUserId, from: "BOOKED", to: "CANCELLED" });

    let providerRefund: { id: string; status: string } | null = null;
    if (quote.amountPaise > 0) {
      try {
        providerRefund = await this.provider.createRefund({
          paymentId: payment.providerPaymentId,
          amountPaise: quote.amountPaise,
          notes: { ticketId: ticket.id, reason: REFUND_REASON_HOLDER },
        });
      } catch (err) {
        this.logger.error(`Refund for ticket ${ticket.id} failed, needs an operator: ${(err as Error).message}`);
      }
    }
    // Status stays PENDING until the refund.processed webhook (docs/07 section 6)
    const status = quote.amountPaise === 0 ? "PROCESSED" : providerRefund ? "PENDING" : "FAILED";
    const refund = await this.prisma.refund.create({
      data: {
        paymentId: payment.id,
        ticketId: ticket.id,
        amountPaise: quote.amountPaise,
        status,
        providerRefundId: providerRefund?.id ?? null,
        processedAt: status === "PROCESSED" ? now : null,
        policyId,
        reason: REFUND_REASON_HOLDER,
      },
    });

    await this.audit.log({ action: "ticket.cancel", entityType: "ticket", entityId: ticket.id, before: { status: "BOOKED" }, after: { status: "CANCELLED" }, ...actor });
    await this.audit.log({
      action: "refund.create",
      entityType: "refund",
      entityId: refund.id,
      after: { ticketId: ticket.id, amountPaise: quote.amountPaise, percent: quote.percent, status },
      ...actor,
    });

    return { ticket: await this.get(userId, ticketId, now), refund: { amountPaise: refund.amountPaise, status: refund.status } };
  }

  /**
   * POST /tickets/:id/transfer (docs/07 section 7). Every denial is audited as ticket.transfer_denied
   * with its code. On success, in one transaction: new holder, passenger name from the recipient
   * profile, transferCount plus 1, a new rotSecret and a ticket_transfers row.
   */
  async transfer(
    userId: string,
    ticketId: string,
    recipient: NormalizedRecipient,
    idempotencyKey: string | undefined,
    actor: AuditActor,
    now = new Date(),
  ): Promise<TransferTicketResult> {
    const slot = idempotencySlot("ticket-transfer", userId, idempotencyKey, { ticketId, recipient });
    const cached = await readIdempotent<TransferTicketResult>(this.redis.client, slot);
    if (cached) return cached;

    const ticket = await this.load(userId, ticketId);
    const deny = async (code: "TICKET_NOT_GIFTABLE" | "RECIPIENT_NOT_FOUND" | "GIFT_TO_SELF", message: string): Promise<never> => {
      await this.audit.log({ action: "ticket.transfer_denied", entityType: "ticket", entityId: ticket.id, after: { reason: code }, ...actor });
      throw new AppError(code, message);
    };

    const settings = await this.settings();
    const rule = canGift(ticket, this.times(ticket).boarding.boardingDepartureAt, now, settings);
    if (!ticket.giftable || !rule.ok) await deny("TICKET_NOT_GIFTABLE", "This ticket cannot be gifted");

    const target = await this.prisma.user.findFirst({
      where: { ...(recipient.channel === "EMAIL" ? { email: recipient.value } : { phone: recipient.value }), deletedAt: null },
      select: { id: true, name: true, email: true, phone: true },
    });
    if (!target) await deny("RECIPIENT_NOT_FOUND", "No registered user has this phone or email");
    const to = target!;
    if (to.id === userId) await deny("GIFT_TO_SELF", "You cannot gift a ticket to yourself");

    const recipientMasked = recipient.channel === "EMAIL" ? maskEmail(recipient.value) : maskPhone(recipient.value);
    const passengerName = to.name?.trim() || (to.phone ? maskPhone(to.phone) : to.email ? maskEmail(to.email) : recipientMasked);

    const moved = await this.prisma.$transaction(async (tx) => {
      // Optimistic lock: a parallel gift, activate or cancel moves the version on first
      const { count } = await tx.ticket.updateMany({
        where: { id: ticket.id, holderUserId: userId, status: "BOOKED", version: ticket.version, transferCount: ticket.transferCount },
        data: {
          holderUserId: to.id,
          transferCount: { increment: 1 },
          qrSecret: this.qr.newRotSecret(),
          version: { increment: 1 },
        },
      });
      if (count !== 1) return false;
      // The passenger row belongs to this one ticket (one row per seat), so it carries the new name
      if (ticket.passengerId) await tx.bookingPassenger.update({ where: { id: ticket.passengerId }, data: { name: passengerName } });
      await tx.ticketTransfer.create({ data: { ticketId: ticket.id, fromUserId: userId, toUserId: to.id } });
      return true;
    });
    if (!moved) await deny("TICKET_NOT_GIFTABLE", "This ticket cannot be gifted");

    await this.audit.log({
      action: "ticket.transfer",
      entityType: "ticket",
      entityId: ticket.id,
      before: { holderUserId: userId, transferCount: ticket.transferCount },
      after: { holderUserId: to.id, transferCount: ticket.transferCount + 1 },
      ...actor,
    });
    this.events.publish("ticket.transferred", { ticketId: ticket.id, fromUserId: userId, toUserId: to.id, seatNo: ticket.seatNo });

    const result: TransferTicketResult = { ticketId: ticket.id, recipientMasked };
    await writeIdempotent(this.redis.client, slot, result);
    return result;
  }

  /** Holder only. Another user's ticket is NOT_FOUND, never FORBIDDEN (no existence leak). */
  private async load(userId: string, ticketId: string): Promise<LoadedTicket> {
    const ticket = (await this.prisma.ticket.findFirst({
      where: { id: ticketId, holderUserId: userId },
      include: TICKET_INCLUDE,
    })) as unknown as LoadedTicket | null;
    if (!ticket) throw new AppError("NOT_FOUND", "Ticket not found");
    return ticket;
  }

  private times(ticket: LoadedTicket) {
    const minutesAt = (stopId: string) => ticket.trip.route.routeStops.find((rs) => rs.stopId === stopId)?.minutesFromOrigin ?? 0;
    const base = ticket.trip.scheduledDepartureAt.getTime();
    return {
      boarding: { boardingDepartureAt: new Date(base + minutesAt(ticket.boardingStopId) * MS_PER_MIN), delayMinutes: ticket.trip.delayMinutes },
      droppingArrivalAt: new Date(base + minutesAt(ticket.droppingStopId) * MS_PER_MIN),
    };
  }

  private async quote(ticket: LoadedTicket, now: Date): Promise<{ quote: RefundQuote; policyName: string; policyId: string | null }> {
    const policy = await this.prisma.refundPolicy.findFirst({ where: { isActive: true }, orderBy: { validFrom: "desc" } });
    const tiers = RefundTiers.safeParse(policy?.tiers);
    const rule = await this.prisma.fareRule.findFirst({
      where: {
        busTypeId: ticket.trip.busTypeId,
        validFrom: { lte: ticket.trip.serviceDate },
        OR: [{ validTo: null }, { validTo: { gte: ticket.trip.serviceDate } }],
      },
      orderBy: { validFrom: "desc" },
      select: { reservationFeePaise: true },
    });
    // farePaise includes the reservation fee; only the fare part is refunded (docs/07 section 6)
    const fee = Math.min(rule?.reservationFeePaise ?? 0, ticket.farePaise);
    const quote = refundQuote({
      farePaise: ticket.farePaise - fee,
      reservationFeePaise: fee,
      departureAt: this.times(ticket).boarding.boardingDepartureAt,
      now,
      tiers: tiers.success ? tiers.data : DEFAULT_REFUND_TIERS,
      isFree: ticket.type === "FREE_TRAVEL",
      cancellationFeePaise: policy?.cancellationFeePaise ?? 0,
    });
    return { quote, policyName: policy?.name ?? "", policyId: policy?.id ?? null };
  }

  private toSummary(ticket: LoadedTicket, settings: TicketSettings): TicketSummaryDto {
    const times = this.times(ticket);
    const window = activationWindow(times.boarding, settings);
    return {
      id: ticket.id,
      code: ticket.code,
      bookingId: ticket.bookingId,
      tripId: ticket.tripId,
      type: ticket.type,
      status: ticket.status,
      seatNo: ticket.seatNo,
      routeCode: ticket.trip.route.code,
      routeNameEn: ticket.trip.route.nameEn,
      routeNameTe: ticket.trip.route.nameTe,
      serviceType: ticket.trip.busType.serviceType,
      serviceDate: formatIstDate(ticket.trip.serviceDate),
      boarding: { stopId: ticket.boardingStop.id, nameEn: ticket.boardingStop.nameEn, nameTe: ticket.boardingStop.nameTe },
      dropping: { stopId: ticket.droppingStop.id, nameEn: ticket.droppingStop.nameEn, nameTe: ticket.droppingStop.nameTe },
      departureAt: times.boarding.boardingDepartureAt.toISOString(),
      arrivalAt: times.droppingArrivalAt.toISOString(),
      activationOpensAt: window.opensAt.toISOString(),
      refund: ticket.refunds[0] ? { amountPaise: ticket.refunds[0].amountPaise, status: ticket.refunds[0].status } : null,
    };
  }

  private toDto(ticket: LoadedTicket, settings: TicketSettings, now: Date, quoted: { quote: RefundQuote }): TicketDto {
    const times = this.times(ticket);
    const window = activationWindow(times.boarding, settings);
    return {
      ...this.toSummary(ticket, settings),
      passengerName: ticket.passenger?.name ?? null,
      farePaise: ticket.farePaise,
      busRegNo: ticket.trip.assignments[0]?.bus?.regNo ?? null,
      displayStatus: deriveTripDisplayStatus({
        status: ticket.trip.status,
        delayMinutes: ticket.trip.delayMinutes,
        hasOpenIncident: ticket.trip.hasOpenIncident,
      }),
      delayMinutes: ticket.trip.delayMinutes,
      activatedAt: ticket.activatedAt?.toISOString() ?? null,
      validUntil: ticket.validUntil?.toISOString() ?? null,
      expiresAt: ticket.expiresAt.toISOString(),
      activationClosesAt: window.closesAt.toISOString(),
      giftable: ticket.giftable,
      transferCount: ticket.transferCount,
      activationValidUntil: (
        ticket.validUntil ?? computeValidUntil(times.droppingArrivalAt, ticket.trip.delayMinutes, settings["ticket.graceMinutesAfterArrival"])
      ).toISOString(),
      canActivate: canActivate(ticket, window, ticket.trip.status, now).ok,
      canCancel: canCancel(ticket, quoted.quote.cancellable).ok,
      canGift: ticket.giftable && canGift(ticket, times.boarding.boardingDepartureAt, now, settings).ok,
    };
  }

  private async settings(): Promise<TicketSettings> {
    const keys = Object.keys(TICKET_SETTING_DEFAULTS) as TicketSettingKey[];
    const values: TicketSettings = { ...TICKET_SETTING_DEFAULTS };
    try {
      const rows = await this.prisma.setting.findMany({ where: { key: { in: keys } }, select: { key: true, value: true } });
      for (const row of rows) {
        if (typeof row.value === "number" && (keys as string[]).includes(row.key)) values[row.key as TicketSettingKey] = row.value;
      }
    } catch {
      // Defaults apply
    }
    return values;
  }

  private message(code: string): string {
    switch (code) {
      case "TICKET_ALREADY_ACTIVE":
        return "This ticket is already active";
      case "ACTIVATION_WINDOW_CLOSED":
        return "Activation is not open for this ticket now";
      case "TICKET_NOT_CANCELLABLE":
        return "This ticket cannot be cancelled";
      default:
        return "This ticket cannot be activated";
    }
  }
}
