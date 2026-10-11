import type { EligibilityCheckDto, EligibilityScheme, EligibilityStatusDto, StreeShaktiCheckInput, StudentCheckInput } from "@aptransit/shared";
import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService, type LogAuditParams } from "../audit/audit.service";
import { ELIGIBILITY_PROVIDER, type EligibilityDecision, type EligibilityProvider } from "./eligibility-provider";

type AuditActor = Pick<LogAuditParams, "actorUserId" | "actorRole" | "ip" | "userAgent">;

/** docs/07 section 9: a check is good for 365 days (A). */
export const ELIGIBILITY_VALID_DAYS = 365;
const MS_PER_DAY = 86_400_000;

interface CheckRow {
  id: string;
  scheme: EligibilityScheme;
  result: "ELIGIBLE" | "NOT_ELIGIBLE";
  reasonCode: string | null;
  checkedAt: Date;
  expiresAt: Date;
}

function toDto(row: CheckRow): EligibilityCheckDto {
  return {
    checkId: row.id,
    scheme: row.scheme,
    result: row.result,
    reasonCode: row.reasonCode,
    checkedAt: row.checkedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

@Injectable()
export class EligibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(ELIGIBILITY_PROVIDER) private readonly provider: EligibilityProvider,
  ) {}

  /**
   * POST /eligibility/stree-shakti. Stores only scheme, result, reason code, provider and its
   * reference, the times (docs/12). The category, domicile and ID type are passed to the provider
   * and never written anywhere, not even in the audit row.
   */
  async checkStreeShakti(userId: string, input: StreeShaktiCheckInput, actor: AuditActor, now = new Date()): Promise<EligibilityCheckDto> {
    return this.record(userId, "STREE_SHAKTI", await this.provider.checkStreeShakti(input), actor, now);
  }

  /**
   * POST /eligibility/student (D-036, school pass). Same storage rule: the declaration and the
   * institution name go to the provider and are never written anywhere.
   */
  async checkStudent(userId: string, input: StudentCheckInput, actor: AuditActor, now = new Date()): Promise<EligibilityCheckDto> {
    return this.record(userId, "STUDENT", await this.provider.checkStudent(input), actor, now);
  }

  private async record(
    userId: string,
    scheme: EligibilityScheme,
    decision: EligibilityDecision,
    actor: AuditActor,
    now: Date,
  ): Promise<EligibilityCheckDto> {
    const row = (await this.prisma.eligibilityCheck.create({
      data: {
        userId,
        scheme,
        provider: this.provider.name,
        result: decision.result,
        reasonCode: decision.reasonCode,
        providerRef: decision.providerRef,
        checkedAt: now,
        expiresAt: new Date(now.getTime() + ELIGIBILITY_VALID_DAYS * MS_PER_DAY),
      },
    })) as CheckRow;
    await this.audit.log({
      action: "eligibility.check",
      entityType: "eligibility_check",
      entityId: row.id,
      after: { scheme: row.scheme, result: row.result, reasonCode: row.reasonCode },
      ...actor,
    });
    return toDto(row);
  }

  /** GET /eligibility: the latest check per scheme. */
  async latest(userId: string): Promise<EligibilityStatusDto> {
    const rows = (await this.prisma.eligibilityCheck.findMany({
      where: { userId },
      orderBy: { checkedAt: "desc" },
    })) as CheckRow[];
    const seen = new Set<string>();
    const out: EligibilityCheckDto[] = [];
    for (const row of rows) {
      if (seen.has(row.scheme)) continue;
      seen.add(row.scheme);
      out.push(toDto(row));
    }
    return out;
  }

  /** The newest check of a scheme (Stree Shakti by default). pass-rules decides whether it is still good. */
  async current(userId: string, scheme: EligibilityScheme = "STREE_SHAKTI"): Promise<CheckRow | null> {
    return (await this.prisma.eligibilityCheck.findFirst({
      where: { userId, scheme },
      orderBy: { checkedAt: "desc" },
    })) as CheckRow | null;
  }
}
