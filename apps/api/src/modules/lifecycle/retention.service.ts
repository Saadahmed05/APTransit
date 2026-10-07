import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

const DAY_MS = 24 * 60 * 60 * 1000;
export const RETENTION_BATCH = 10_000;

/** What each retention rule keeps (docs/05 Retention jobs, docs/13 Retention). */
export interface RetentionRule {
  name: string;
  table: string;
  /** SQL condition with one parameter: the cutoff time. */
  where: Prisma.Sql;
}

/** Cutoffs for a given now: GPS 30 days, OTP 24 h, dead refresh tokens 30 days, notifications 90 days. */
export function retentionRules(now: Date): RetentionRule[] {
  const ago = (ms: number) => new Date(now.getTime() - ms);
  return [
    { name: "gps_locations", table: "gps_locations", where: Prisma.sql`"recordedAt" < ${ago(30 * DAY_MS)}` },
    { name: "otp_codes", table: "otp_codes", where: Prisma.sql`"createdAt" < ${ago(DAY_MS)}` },
    {
      name: "refresh_tokens",
      table: "refresh_tokens",
      // Only tokens that can no longer be used: expired or revoked, for more than 30 days
      where: Prisma.sql`(("revokedAt" IS NOT NULL AND "revokedAt" < ${ago(30 * DAY_MS)}) OR "expiresAt" < ${ago(30 * DAY_MS)})`,
    },
    { name: "notifications", table: "notifications", where: Prisma.sql`"createdAt" < ${ago(90 * DAY_MS)}` },
  ];
}

/**
 * Daily retention (maintenance queue, 02:00 IST). Deletes in batches of 10,000 rows so a large
 * backlog never holds a long lock or blows the Neon compute budget in one statement.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async run(now = new Date()): Promise<Record<string, number>> {
    const deleted: Record<string, number> = {};
    for (const rule of retentionRules(now)) {
      let total = 0;
      for (;;) {
        const count = await this.prisma.$executeRaw(Prisma.sql`
          DELETE FROM ${Prisma.raw(`"${rule.table}"`)}
          WHERE ctid IN (SELECT ctid FROM ${Prisma.raw(`"${rule.table}"`)} WHERE ${rule.where} LIMIT ${RETENTION_BATCH})`);
        total += count;
        if (count < RETENTION_BATCH) break;
      }
      deleted[rule.name] = total;
    }
    this.logger.log(`Retention removed ${JSON.stringify(deleted)}`);
    return deleted;
  }
}
