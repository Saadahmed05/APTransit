import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";
import type { Env } from "../../config/env";
import { QUEUES } from "./queue.constants";

export { QUEUES } from "./queue.constants";

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const redisUrl = new URL(config.get("REDIS_URL", { infer: true }));
        return {
          connection: {
            host: redisUrl.hostname,
            port: parseInt(redisUrl.port || (redisUrl.protocol === "rediss:" ? "6380" : "6379"), 10),
            username: redisUrl.username ? decodeURIComponent(redisUrl.username) : undefined,
            password: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined,
            tls: redisUrl.protocol === "rediss:" ? {} : undefined,
            maxRetriesPerRequest: null,
            enableOfflineQueue: false,
            lazyConnect: true,
            retryStrategy: () => null,
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
  exports: [BullModule],
})
export class QueueModule {}
