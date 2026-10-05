import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { RedisModule } from "../../redis/redis.module";
import { PaymentsModule } from "../payments/payments.module";
import { QueueModule } from "../queue/queue.module";
import { BookingsController } from "./bookings.controller";
import { BookingsService } from "./bookings.service";

@Module({
  imports: [PrismaModule, RedisModule, QueueModule, PaymentsModule],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
