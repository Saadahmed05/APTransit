import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";
import type { Env } from "../../config/env";
import { QUEUES } from "./queue.constants";
import { QueueStatusService } from "./queue-status.service";

export { QUEUES } from "./queue.constants";

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const redisUrl = new URL(config.get("REDIS_URL", { infer: true }));
        const isWorker = process.env.WORKER === "1";
        return {
          connection: {
            host: redisUrl.hostname,
            port: parseInt(redisUrl.port || "6379", 10),
            username: redisUrl.username ? decodeURIComponent(redisUrl.username) : undefined,
            password: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined,
            tls: redisUrl.protocol === "rediss:" ? {} : undefined,
            maxRetriesPerRequest: null,
            // API producers fail fast when Redis is down; workers queue commands and wait.
            enableOfflineQueue: isWorker,
            lazyConnect: true,
            // Upstash closes idle connections: always reconnect, never give up.
            retryStrategy: (attempt: number) => Math.min(attempt * 500, 10_000),
          },
        };
      },
    }),
    BullModule.registerQueue(
      { name: QUEUES.NOTIFICATIONS },
      { name: QUEUES.EXPIRY },
      { name: QUEUES.ROLLUPS },
      { name: QUEUES.MAINTENANCE },
    ),
  ],
  providers: [QueueStatusService],
  exports: [BullModule, QueueStatusService],
})
export class QueueModule {}
