import type { HealthDto, ProbeState } from "@aptransit/shared";
import { Injectable, Optional } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RedisService } from "../../redis/redis.service";
import { readWorkerState, WORKER_HEARTBEAT_KEY } from "../lifecycle/worker-heartbeat";
import { QueueStatusService } from "../queue/queue-status.service";

export const PROBE_TIMEOUT_MS = 1_000;

/** Runs a check and reports ok or down. Never throws, never waits longer than the timeout. */
export async function probe(check: () => Promise<unknown>, timeoutMs = PROBE_TIMEOUT_MS): Promise<ProbeState> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("probe timed out")), timeoutMs);
  });
  try {
    await Promise.race([check(), timeout]);
    return "ok";
  } catch {
    return "down";
  } finally {
    clearTimeout(timer);
  }
}

function appVersion(): string {
  const sha = process.env.RENDER_GIT_COMMIT ?? process.env.GIT_SHA;
  return sha ? sha.slice(0, 7) : "dev";
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Optional() private readonly queues?: QueueStatusService,
  ) {}

  async check(): Promise<HealthDto> {
    const [db, redis, worker] = await Promise.all([
      probe(() => this.prisma.$queryRaw`SELECT 1`),
      probe(() => this.redis.client.ping()),
      probe(async () => {
        if ((await readWorkerState(this.redis.client)) !== "ok") throw new Error("stale");
      }),
    ]);
    // Extras for monitoring (Day 18): heartbeat age and queue depth, best effort within the timeout
    let workerAgeSec: number | null = null;
    let queues: HealthDto["queues"];
    if (redis === "ok") {
      await probe(async () => {
        const beat = await this.redis.client.get(WORKER_HEARTBEAT_KEY);
        workerAgeSec = beat ? Math.max(0, Math.round((Date.now() - Date.parse(beat)) / 1000)) : null;
        if (this.queues) queues = await this.queues.depths();
      });
    }
    return {
      status: db === "ok" && redis === "ok" ? "ok" : "degraded",
      workerAgeSec,
      queues,
      db,
      redis,
      worker: worker === "ok" ? "ok" : "stale",
      version: appVersion(),
      time: new Date().toISOString(),
    };
  }
}
