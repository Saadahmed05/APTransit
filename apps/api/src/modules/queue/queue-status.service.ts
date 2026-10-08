import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";
import { QUEUES } from "./queue.constants";

export interface QueueDepth {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
}

export interface FailedJob {
  queue: string;
  id: string;
  name: string;
  reason: string;
  attempts: number;
  failedAt: string | null;
}

/** Read only view of the BullMQ queues: depth for /health, failed jobs for admins (Day 18). */
@Injectable()
export class QueueStatusService {
  private readonly queues: Queue[];

  constructor(
    @InjectQueue(QUEUES.NOTIFICATIONS) notifications: Queue,
    @InjectQueue(QUEUES.EXPIRY) expiry: Queue,
    @InjectQueue(QUEUES.ROLLUPS) rollups: Queue,
    @InjectQueue(QUEUES.MAINTENANCE) maintenance: Queue,
  ) {
    this.queues = [notifications, expiry, rollups, maintenance];
  }

  async depths(): Promise<Record<string, QueueDepth>> {
    const entries = await Promise.all(
      this.queues.map(async (q) => {
        const c = await q.getJobCounts("waiting", "active", "delayed", "failed");
        return [q.name, { waiting: c.waiting ?? 0, active: c.active ?? 0, delayed: c.delayed ?? 0, failed: c.failed ?? 0 }] as const;
      }),
    );
    return Object.fromEntries(entries);
  }

  /** The newest failed jobs across all queues. Job data is not returned: it can hold ids and emails. */
  async failed(limit = 50): Promise<FailedJob[]> {
    const lists = await Promise.all(this.queues.map((q) => q.getFailed(0, limit - 1)));
    return lists
      .flat()
      .filter((j) => j)
      .map((j) => ({
        queue: j.queueName,
        id: String(j.id),
        name: j.name,
        reason: (j.failedReason ?? "").slice(0, 300),
        attempts: j.attemptsMade,
        failedAt: j.finishedOn ? new Date(j.finishedOn).toISOString() : null,
      }))
      .sort((a, b) => (b.failedAt ?? "").localeCompare(a.failedAt ?? ""))
      .slice(0, limit);
  }
}
