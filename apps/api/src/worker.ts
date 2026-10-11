import "reflect-metadata";
import { PLATFORM_TIME_ZONE } from "@aptransit/shared";
import { getQueueToken } from "@nestjs/bullmq";
import { NestFactory } from "@nestjs/core";
import type { Queue } from "bullmq";
import { Logger } from "nestjs-pino";
import { WORKER_HEARTBEAT_EVERY_MS, writeHeartbeat } from "./modules/lifecycle/worker-heartbeat";
import { EXPIRE_STATUSES_JOB } from "./modules/queue/processors/expiry.processor";
import { FAILED_JOBS_SUMMARY_JOB, RETENTION_JOB } from "./modules/queue/processors/maintenance.processor";
import { QUEUES } from "./modules/queue/queue.constants";
import { RedisService } from "./redis/redis.service";
import { bullmqDrainDelaySec } from "./modules/queue/worker-options";
import { WorkerModule } from "./worker.module";

// Background worker entry (docs/03): WorkerModule, no HTTP server.
// BullMQ consumers are registered here from Day 5 (prompts/day-05.md).

async function bootstrap(): Promise<void> {
  if (process.env.WORKER !== "1") {
    console.error("worker.ts must run with WORKER=1 (docs/15-env-setup.md).");
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  logger.log(
    `Worker started. BullMQ expiry and maintenance workers use drainDelay=${bullmqDrainDelaySec()}s from BULLMQ_DRAIN_DELAY_SEC.`,
    "Worker",
  );

  // Register repeatable maintenance job: daily at 00:30 IST
  try {
    const maintenanceQueue = app.get<Queue>(getQueueToken(QUEUES.MAINTENANCE));
    // Upsert, so restarts never stack duplicate schedules.
    await maintenanceQueue.upsertJobScheduler(
      "generate-trips",
      { pattern: "30 0 * * *", tz: PLATFORM_TIME_ZONE },
      { name: "generate-trips" },
    );
    logger.log("Scheduled repeatable generate-trips job at 00:30 IST daily", "Worker");
  } catch (err) {
    logger.warn(`Could not schedule repeatable job on maintenance queue: ${(err as Error).message}`, "Worker");
  }

  // Register repeatable rollups job: daily at 00:15 IST (Day 15)
  try {
    const rollupsQueue = app.get<Queue>(getQueueToken(QUEUES.ROLLUPS));
    await rollupsQueue.upsertJobScheduler(
      "daily-rollups",
      { pattern: "15 0 * * *", tz: PLATFORM_TIME_ZONE },
      { name: "daily-rollups" },
    );
    logger.log("Scheduled repeatable daily-rollups job at 00:15 IST daily", "Worker");
  } catch (err) {
    logger.warn(`Could not schedule repeatable job on rollups queue: ${(err as Error).message}`, "Worker");
  }

  // Retention 02:00 IST and the failed jobs summary 07:00 IST (Day 18)
  try {
    const maintenanceQueue = app.get<Queue>(getQueueToken(QUEUES.MAINTENANCE));
    await maintenanceQueue.upsertJobScheduler(RETENTION_JOB, { pattern: "0 2 * * *", tz: PLATFORM_TIME_ZONE }, { name: RETENTION_JOB });
    await maintenanceQueue.upsertJobScheduler(FAILED_JOBS_SUMMARY_JOB, { pattern: "0 7 * * *", tz: PLATFORM_TIME_ZONE }, { name: FAILED_JOBS_SUMMARY_JOB });
    logger.log("Scheduled retention at 02:00 IST and the failed jobs summary at 07:00 IST", "Worker");
  } catch (err) {
    logger.warn(`Could not schedule retention jobs: ${(err as Error).message}`, "Worker");
  }

  // Ticket and pass expiry every 5 min (Day 9), upserted so restarts never stack schedules
  try {
    const expiryQueue = app.get<Queue>(getQueueToken(QUEUES.EXPIRY));
    await expiryQueue.upsertJobScheduler(EXPIRE_STATUSES_JOB, { every: 5 * 60_000 }, { name: EXPIRE_STATUSES_JOB, opts: { removeOnComplete: true, removeOnFail: 50 } });
    logger.log("Scheduled repeatable expire-statuses job every 5 min", "Worker");
  } catch (err) {
    logger.warn(`Could not schedule expire-statuses: ${(err as Error).message}`, "Worker");
  }

  // Heartbeat for GET /health (worker ok or stale)
  const redis = app.get(RedisService);
  const beat = () =>
    writeHeartbeat(redis.client).catch((err: unknown) => logger.warn(`Heartbeat failed: ${(err as Error).message}`, "Worker"));
  void beat();
  const heartbeat = setInterval(() => void beat(), WORKER_HEARTBEAT_EVERY_MS);

  const stop = async (): Promise<void> => {
    clearInterval(heartbeat);
    logger.log("Stopping worker...", "Worker");
    await app.close();
    process.exit(0);
  };
  process.once("SIGTERM", () => void stop());
  process.once("SIGINT", () => void stop());
}

void bootstrap();
