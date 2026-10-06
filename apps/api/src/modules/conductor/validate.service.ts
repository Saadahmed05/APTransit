import {
  type ScanReason,
  type ValidateTicketInput,
  type ValidateTicketResult,
  formatIstDate,
} from "@aptransit/shared";
import { Injectable, Logger } from "@nestjs/common";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService, type LogAuditParams } from "../audit/audit.service";
import { QrService } from "../tickets/qr.service";
import { scanStatusReason } from "../tickets/ticket-rules";
import { ConductorService } from "./conductor.service";

@Injectable()
export class ValidateService {
  private readonly logger = new Logger(ValidateService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly conductor: ConductorService,
    private readonly qr: QrService,
    private readonly audit: AuditService,
    private readonly events: DomainEventsService,
  ) {}

  async validate(
    userId: string,
    input: ValidateTicketInput,
    actor: Pick<LogAuditParams, "actorUserId" | "actorRole" | "ip" | "userAgent">,
    now = new Date(),
  ): Promise<ValidateTicketResult> {
    const started = performance.now();
    const assignment = await this.conductor.current(userId, input.tripId, now);
    // D-027: manual entry supplies possession of the same live rotating code. The token is rebuilt
    // only from trusted database fields, then enters the unchanged signature/code/rule pipeline.
    let qrText = "qr" in input ? input.qr : "";
    if ("ticketNumber" in input) {
      const ticket = await this.prisma.ticket.findUnique({
        where: { code: input.ticketNumber },
        select: {
          id: true,
          tripId: true,
          validUntil: true,
          expiresAt: true,
          trip: { select: { serviceDate: true, scheduledDepartureAt: true } },
        },
      });
      if (ticket)
        qrText =
          this.qr.signToken({
            t: "T",
            i: ticket.id,
            tr: ticket.tripId,
            d: formatIstDate(ticket.trip.serviceDate),
            v: Math.floor((ticket.validUntil ?? ticket.expiresAt).getTime() / 1000),
          }) +
          "~" +
          input.liveCode;
    }
    const content = await this.qr.verifyContent(qrText);
    let reason: ScanReason = typeof content === "string" ? content : "NOT_FOUND";
    let ticketId: string | null = null;
    let passId: string | null = null;
    let holderUserId: string | null = null;
    let earlierScanAt: string | undefined;
    let detail: ValidateTicketResult["ticket"];
    let context: ValidateTicketResult["context"];

    const outcome = await this.prisma.$transaction(async (tx) => {
      if (typeof content !== "string") {
        const { payload, code } = content;
        const ticket =
          payload.t === "T"
            ? await tx.ticket.findUnique({
                relationLoadStrategy: "join",
                where: { id: payload.i },
                select: {
                  id: true,
                  status: true,
                  validUntil: true,
                  qrSecret: true,
                  tripId: true,
                  holderUserId: true,
                  version: true,
                  scannedAt: true,
                  seatNo: true,
                  type: true,
                  passenger: { select: { name: true } },
                  holderUser: { select: { name: true } },
                  trip: { select: { serviceDate: true, scheduledDepartureAt: true } },
                  route: { select: { nameEn: true } },
                  boardingStop: { select: { nameEn: true } },
                  droppingStop: { select: { nameEn: true } },
                  scans: {
                    where: { tripId: input.tripId, result: "VALID" },
                    orderBy: { scannedAt: "asc" },
                    take: 1,
                    select: { scannedAt: true },
                  },
                },
              })
            : null;
        const pass =
          payload.t === "P"
            ? await tx.pass.findUnique({
                where: { id: payload.i },
                select: {
                  id: true,
                  status: true,
                  validUntil: true,
                  qrSecret: true,
                  passType: { select: { eligibleServiceTypes: true } },
                  user: { select: { name: true } },
                  scans: {
                    where: { tripId: input.tripId, result: "VALID" },
                    orderBy: { scannedAt: "asc" },
                    take: 1,
                    select: { scannedAt: true },
                  },
                },
              })
            : null;
        const row = ticket ?? pass;
        ticketId = ticket?.id ?? null;
        passId = pass?.id ?? null;
        if (row) {
          context = {
            validUntil: row.validUntil?.toISOString() ?? null,
            ...(ticket
              ? {
                  route: ticket.route.nameEn,
                  departureAt: ticket.trip.scheduledDepartureAt.toISOString(),
                  serviceDate: formatIstDate(ticket.trip.serviceDate),
                }
              : { services: pass!.passType.eligibleServiceTypes }),
          };
          const validCode = await this.qr.verifyCode(
            this.qr.decryptRotSecret(row.qrSecret),
            code,
            now.getTime(),
          );
          const earlier = row.scans[0];
          reason = validCode
            ? scanStatusReason({
                status: row.status,
                validUntil: row.validUntil,
                now,
                alreadyScanned: Boolean(earlier),
                wrongTrip: Boolean(
                  ticket && (ticket.tripId !== input.tripId || payload.tr !== ticket.tripId),
                ),
                wrongDate: Boolean(
                  ticket &&
                  (payload.d !== formatIstDate(now) ||
                    formatIstDate(ticket.trip.serviceDate) !== formatIstDate(now)),
                ),
                serviceEligible:
                  !pass ||
                  pass.passType.eligibleServiceTypes.includes(assignment.bus.busType.serviceType),
              })
            : "STALE_CODE";
          if (reason === "OK") {
            if (ticket) {
              const changed = await tx.ticket.updateMany({
                where: { id: ticket.id, status: "ACTIVE", version: ticket.version },
                data: { status: "SCANNED", scannedAt: now, version: { increment: 1 } },
              });
              if (changed.count !== 1) reason = "ALREADY_SCANNED";
              else holderUserId = ticket.holderUserId;
            } else {
              // Serialize pass scans for a trip across processes, then recheck the winning scan.
              const locked = await tx.pass.update({
                where: { id: pass!.id },
                data: { updatedAt: now },
              });
              reason = scanStatusReason({
                status: locked.status,
                validUntil: locked.validUntil,
                now,
                alreadyScanned: false,
                wrongTrip: false,
                wrongDate: false,
                serviceEligible: true,
              });
              const winner = await tx.ticketScan.findFirst({
                where: { passId: pass!.id, tripId: input.tripId, result: "VALID" },
              });
              if (winner && reason === "OK") {
                reason = "ALREADY_SCANNED";
                earlierScanAt = winner.scannedAt.toISOString();
              }
            }
          }
          if (reason === "ALREADY_SCANNED" && !earlierScanAt) {
            const scanned =
              ticket?.scannedAt ??
              earlier?.scannedAt ??
              (
                await tx.ticket.findUnique({
                  where: { id: ticketId ?? "missing" },
                  select: { scannedAt: true },
                })
              )?.scannedAt;
            if (scanned) earlierScanAt = scanned.toISOString();
          }
          if (reason === "OK")
            detail = ticket
              ? {
                  passengerName: ticket.passenger?.name ?? ticket.holderUser.name ?? "",
                  seatNo: ticket.seatNo,
                  routeName: ticket.route.nameEn,
                  boarding: ticket.boardingStop.nameEn,
                  dropping: ticket.droppingStop.nameEn,
                  type: ticket.type,
                }
              : {
                  passengerName: pass!.user.name ?? "",
                  seatNo: null,
                  routeName: assignment.trip.route.nameEn,
                  boarding: "",
                  dropping: "",
                  type: "PASS",
                };
        }
      }
      return tx.ticketScan.create({
        data: {
          ticketId,
          passId,
          tripId: input.tripId,
          conductorId: assignment.conductorId!,
          result: reason === "OK" ? "VALID" : "INVALID",
          reason,
          scannedAt: now,
          deviceTime: new Date(input.deviceTime),
          offline: false,
        },
      });
    });
    await this.audit.log({
      action: "ticket.scan",
      entityType: "ticket_scan",
      entityId: outcome.id,
      after: { result: outcome.result, reason },
      ...actor,
    });
    this.events.publish("conductor.scan", { tripId: input.tripId });
    if (holderUserId && ticketId)
      this.events.publish("ticket.status", {
        ticketId,
        holderUserId,
        from: "ACTIVE",
        to: "SCANNED",
      });
    this.logger.log(
      {
        durationMs: Math.round((performance.now() - started) * 100) / 100,
        result: outcome.result,
        reason,
      },
      "Ticket validation timing",
    );
    return {
      result: outcome.result,
      reason,
      ...(earlierScanAt ? { earlierScanAt } : {}),
      ...(detail ? { ticket: detail } : {}),
      ...(context ? { context } : {}),
    };
  }
}
