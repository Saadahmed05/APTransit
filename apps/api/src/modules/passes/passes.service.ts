import { generatePassCode, type PassDto, type PassQrDto, type PassTypeDto, QR_PERIOD_SEC } from "@aptransit/shared";
import { Injectable } from "@nestjs/common";
import { AppError } from "../../common/errors/app-error";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService, type LogAuditParams } from "../audit/audit.service";
import { EligibilityService } from "../eligibility/eligibility.service";
import { QrService } from "../tickets/qr.service";
import { canActivatePass, canCreatePass, PASS_PAYMENT_ABANDON_MINUTES, PASS_SETTING_DEFAULTS, passActivateBy, passValidity } from "./pass-rules";

type AuditActor = Pick<LogAuditParams, "actorUserId" | "actorRole" | "ip" | "userAgent">;

const MS_PER_MIN = 60_000;

const PASS_INCLUDE = {
  passType: true,
  eligibilityCheck: { select: { expiresAt: true } },
} as const;

interface LoadedPassType {
  id: string;
  kind: PassDto["kind"];
  nameEn: string;
  nameTe: string;
  durationDays: number;
  pricePaise: number;
  eligibleServiceTypes: PassDto["eligibleServiceTypes"];
  scheme: "STREE_SHAKTI" | null;
  isActive: boolean;
}

export interface LoadedPass {
  id: string;
  code: string;
  userId: string;
  passTypeId: string;
  status: PassDto["status"];
  activatedAt: Date | null;
  validFrom: Date | null;
  validUntil: Date | null;
  qrSecret: string;
  createdAt: Date;
  passType: LoadedPassType;
  eligibilityCheck: { expiresAt: Date } | null;
}

/** docs/06 Passes. Owner only; every rule comes from pass-rules.ts. Passes are never giftable. */
@Injectable()
export class PassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly eligibility: EligibilityService,
    private readonly qr: QrService,
  ) {}

  async listTypes(): Promise<PassTypeDto[]> {
    const types = (await this.prisma.passType.findMany({ where: { isActive: true }, orderBy: { pricePaise: "asc" } })) as LoadedPassType[];
    return types.map((t) => ({
      id: t.id,
      kind: t.kind,
      nameEn: t.nameEn,
      nameTe: t.nameTe,
      durationDays: t.durationDays,
      pricePaise: t.pricePaise,
      eligibleServiceTypes: t.eligibleServiceTypes,
      scheme: t.scheme,
    }));
  }

  async list(userId: string, now = new Date()): Promise<PassDto[]> {
    const passes = (await this.prisma.pass.findMany({
      where: { userId },
      include: PASS_INCLUDE,
      orderBy: { createdAt: "desc" },
    })) as unknown as LoadedPass[];
    const days = await this.activateWithinDays();
    const activeKinds = new Set(passes.filter((p) => p.status === "ACTIVE").map((p) => p.passType.kind));
    return passes.map((p) => this.toDto(p, days, activeKinds.has(p.passType.kind), now));
  }

  /**
   * POST /passes. Paid kinds start PENDING_PAYMENT (a recent unpaid one of the same type is reused,
   * so a retried Buy never makes two). FREE_TRAVEL is READY at once, but only with a current ELIGIBLE check.
   */
  async create(userId: string, passTypeId: string, actor: AuditActor, now = new Date()): Promise<PassDto> {
    const type = (await this.prisma.passType.findUnique({ where: { id: passTypeId } })) as LoadedPassType | null;
    if (!type?.isActive) throw new AppError("NOT_FOUND", "Pass type not found");

    const check = type.kind === "FREE_TRAVEL" ? await this.eligibility.current(userId) : null;
    const openFree =
      type.kind === "FREE_TRAVEL"
        ? (await this.prisma.pass.count({ where: { userId, passTypeId: type.id, status: { in: ["READY", "ACTIVE"] } } })) > 0
        : false;
    const rule = canCreatePass(type.kind, check, openFree, now);
    if (!rule.ok) {
      throw new AppError(
        rule.error,
        rule.error === "ELIGIBILITY_REQUIRED" ? "A free travel pass needs an eligibility check first" : "You already have a free travel pass",
      );
    }

    if (type.kind !== "FREE_TRAVEL") {
      const pending = (await this.prisma.pass.findFirst({
        where: {
          userId,
          passTypeId: type.id,
          status: "PENDING_PAYMENT",
          createdAt: { gt: new Date(now.getTime() - PASS_PAYMENT_ABANDON_MINUTES * MS_PER_MIN) },
        },
        include: PASS_INCLUDE,
        orderBy: { createdAt: "desc" },
      })) as unknown as LoadedPass | null;
      if (pending) return this.toDto(pending, await this.activateWithinDays(), false, now);
    }

    const pass = (await this.prisma.pass.create({
      data: {
        code: generatePassCode(),
        userId,
        passTypeId: type.id,
        status: type.kind === "FREE_TRAVEL" ? "READY" : "PENDING_PAYMENT",
        eligibilityCheckId: check?.id ?? null,
        qrSecret: this.qr.newRotSecret(),
        createdAt: now,
      },
      include: PASS_INCLUDE,
    })) as unknown as LoadedPass;
    await this.audit.log({
      action: "pass.create",
      entityType: "pass",
      entityId: pass.id,
      after: { kind: type.kind, status: pass.status },
      ...actor,
    });
    return this.toDto(pass, await this.activateWithinDays(), false, now);
  }

  async activate(userId: string, passId: string, actor: AuditActor, now = new Date()): Promise<PassDto> {
    const pass = await this.load(userId, passId);
    const days = await this.activateWithinDays();
    const otherActive = await this.prisma.pass.count({
      where: { userId, id: { not: pass.id }, status: "ACTIVE", passType: { kind: pass.passType.kind }, validUntil: { gt: now } },
    });
    const rule = canActivatePass(pass, days, otherActive > 0, now);
    if (!rule.ok) {
      throw new AppError(rule.error, rule.error === "PASS_ALREADY_ACTIVE" ? "You already have an active pass of this kind" : "This pass cannot be activated");
    }

    const { validFrom, validUntil } = passValidity(now, pass.passType.durationDays, pass.eligibilityCheck?.expiresAt);
    // Conditional update: a parallel activate finds the status moved on
    const { count } = await this.prisma.pass.updateMany({
      where: { id: pass.id, status: "READY" },
      data: { status: "ACTIVE", activatedAt: now, validFrom, validUntil },
    });
    if (count !== 1) throw new AppError("PASS_ALREADY_ACTIVE", "This pass is already active");

    await this.audit.log({
      action: "pass.activate",
      entityType: "pass",
      entityId: pass.id,
      before: { status: "READY" },
      after: { status: "ACTIVE", validUntil: validUntil.toISOString() },
      ...actor,
    });
    const fresh = await this.load(userId, passId);
    return this.toDto(fresh, days, true, now);
  }

  /** Same shape as the ticket QR, "t": "P". The rotating secret only while ACTIVE. */
  async qrFor(userId: string, passId: string, now = new Date()): Promise<PassQrDto> {
    const pass = await this.load(userId, passId);
    const until = pass.validUntil ?? passActivateBy(pass.createdAt, await this.activateWithinDays());
    const token = this.qr.signToken({ t: "P", i: pass.id, tr: null, d: null, v: Math.floor(until.getTime() / 1000) });
    const rotSecret = pass.status === "ACTIVE" ? this.qr.decryptRotSecret(pass.qrSecret).toString("base64url") : null;
    return { token, rotSecret, periodSec: QR_PERIOD_SEC, serverTime: now.toISOString() };
  }

  /** Owner only. Another user's pass is NOT_FOUND, never FORBIDDEN. */
  private async load(userId: string, passId: string): Promise<LoadedPass> {
    const pass = (await this.prisma.pass.findFirst({ where: { id: passId, userId }, include: PASS_INCLUDE })) as unknown as LoadedPass | null;
    if (!pass) throw new AppError("NOT_FOUND", "Pass not found");
    return pass;
  }

  private toDto(pass: LoadedPass, activateWithinDays: number, hasActiveOfKind: boolean, now: Date): PassDto {
    return {
      id: pass.id,
      code: pass.code,
      passTypeId: pass.passTypeId,
      kind: pass.passType.kind,
      nameEn: pass.passType.nameEn,
      nameTe: pass.passType.nameTe,
      status: pass.status,
      pricePaise: pass.passType.pricePaise,
      durationDays: pass.passType.durationDays,
      eligibleServiceTypes: pass.passType.eligibleServiceTypes,
      createdAt: pass.createdAt.toISOString(),
      activateBy: passActivateBy(pass.createdAt, activateWithinDays).toISOString(),
      activatedAt: pass.activatedAt?.toISOString() ?? null,
      validFrom: pass.validFrom?.toISOString() ?? null,
      validUntil: pass.validUntil?.toISOString() ?? null,
      activationValidUntil: (pass.validUntil ?? passValidity(now, pass.passType.durationDays, pass.eligibilityCheck?.expiresAt).validUntil).toISOString(),
      canActivate: canActivatePass(pass, activateWithinDays, pass.status === "READY" && hasActiveOfKind, now).ok,
    };
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
