import { describe, expect, it, vi } from "vitest";
import { RETENTION_BATCH, RetentionService, retentionRules } from "../src/modules/lifecycle/retention.service";
import { QueueStatusService } from "../src/modules/queue/queue-status.service";
import type { PrismaService } from "../src/prisma/prisma.service";

const NOW = new Date("2026-10-07T20:30:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

describe("Day 18: retention (docs/05 Retention jobs)", () => {
  it("uses the documented cutoffs with a frozen clock", () => {
    const rules = Object.fromEntries(retentionRules(NOW).map((r) => [r.name, r.where]));
    expect(rules.gps_locations!.values).toEqual([new Date(NOW.getTime() - 30 * DAY)]);
    expect(rules.otp_codes!.values).toEqual([new Date(NOW.getTime() - DAY)]);
    expect(rules.refresh_tokens!.values).toEqual([new Date(NOW.getTime() - 30 * DAY), new Date(NOW.getTime() - 30 * DAY)]);
    expect(rules.refresh_tokens!.sql).toContain('"revokedAt" IS NOT NULL');
    expect(rules.notifications!.values).toEqual([new Date(NOW.getTime() - 90 * DAY)]);
  });

  it("deletes in batches of 10,000 until a short batch, table by table", async () => {
    const counts = [RETENTION_BATCH, RETENTION_BATCH, 7, 0, 3, 120];
    const executeRaw = vi.fn(async () => counts.shift() ?? 0);
    const service = new RetentionService({ $executeRaw: executeRaw } as unknown as PrismaService);
    await expect(service.run(NOW)).resolves.toEqual({
      gps_locations: 2 * RETENTION_BATCH + 7,
      otp_codes: 0,
      refresh_tokens: 3,
      notifications: 120,
    });
    expect(executeRaw).toHaveBeenCalledTimes(6);
    const first = executeRaw.mock.calls[0] as unknown as [{ sql: string; values: unknown[] }];
    expect(first[0].sql).toContain('DELETE FROM "gps_locations"');
    expect(first[0].sql).toContain("LIMIT");
  });
});

describe("Day 18: failed jobs", () => {
  it("lists the newest failed jobs across queues without job data", async () => {
    const job = (queueName: string, finishedOn: number) => ({
      queueName,
      id: `${queueName}-1`,
      name: "send-email",
      failedReason: "Resend 500",
      attemptsMade: 3,
      finishedOn,
      data: { email: "ravi@example.com" },
    });
    const queue = (name: string, jobs: unknown[]) => ({ name, getFailed: vi.fn(async () => jobs), getJobCounts: vi.fn() });
    const service = new QueueStatusService(
      queue("notifications", [job("notifications", 2_000)]) as never,
      queue("expiry", []) as never,
      queue("rollups", [job("rollups", 3_000)]) as never,
      queue("maintenance", []) as never,
    );
    const failed = await service.failed(50);
    expect(failed.map((f) => f.queue)).toEqual(["rollups", "notifications"]);
    expect(failed[0]).toEqual({
      queue: "rollups",
      id: "rollups-1",
      name: "send-email",
      reason: "Resend 500",
      attempts: 3,
      failedAt: new Date(3_000).toISOString(),
    });
    expect(JSON.stringify(failed)).not.toContain("ravi@example.com");
  });
});
