import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { AppThrottlerGuard } from "./common/guards/app-throttler.guard";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { AuditInterceptor } from "./common/interceptors/audit.interceptor";
import { loggerParams } from "./common/logger";
import { RedisThrottlerStorage } from "./common/throttler/redis-throttler.storage";
import { validateEnv } from "./config/env";
import { AuditModule } from "./modules/audit/audit.module";
import { AuthModule } from "./modules/auth/auth.module";
import { BookingsModule } from "./modules/bookings/bookings.module";
import { HealthModule } from "./modules/health/health.module";
import { NetworkModule } from "./modules/network/network.module";
import { QueueModule } from "./modules/queue/queue.module";
import { TripsModule } from "./modules/trips/trips.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { RedisService } from "./redis/redis.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      ignoreEnvFile: process.env.NODE_ENV === "test",
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: loggerParams,
    }),
    PrismaModule,
    RedisModule,
    // docs/12: default 120 requests per user or IP per minute. Routes tighten it with @Throttle.
    ThrottlerModule.forRootAsync({
      inject: [RedisService],
      useFactory: (redis: RedisService) => ({
        throttlers: [{ name: "default", ttl: 60_000, limit: 120 }],
        storage: new RedisThrottlerStorage(redis),
      }),
    }),
    AuditModule,
    AuthModule,
    HealthModule,
    NetworkModule,
    TripsModule,
    BookingsModule,
    QueueModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Order matters: the auth guard sets req.user before the throttler picks its tracker.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
