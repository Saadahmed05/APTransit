import "reflect-metadata";
import { getQueueToken } from "@nestjs/bullmq";
import { NestFactory } from "@nestjs/core";
import type { Queue } from "bullmq";
import { Logger } from "nestjs-pino";
import { QUEUES } from "./modules/queue/queue.constants";
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
    await maintenanceQueue.add(
      "generate-trips",
      {},
      {
        repeat: {
          pattern: "30 0 * * *",
          tz: "Asia/Kolkata",
        },
        jobId: "repeatable:generate-trips",
      },
    );
    logger.log("Scheduled repeatable generate-trips job at 00:30 IST daily", "Worker");
  } catch (err) {
    logger.warn(`Could not schedule repeatable job on maintenance queue: ${(err as Error).message}`, "Worker");
  }

  const stop = async (): Promise<void> => {
    logger.log("Stopping worker...", "Worker");
    await app.close();
    process.exit(0);
  };
  process.once("SIGTERM", () => void stop());
  process.once("SIGINT", () => void stop());
}

void bootstrap();
