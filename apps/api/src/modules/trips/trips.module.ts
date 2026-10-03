import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { RedisModule } from "../../redis/redis.module";
import { TripGeneratorService } from "./trip-generator.service";
import { TripsController } from "./trips.controller";
import { TripsService } from "./trips.service";

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [TripsController],
  providers: [TripsService, TripGeneratorService],
  exports: [TripsService, TripGeneratorService],
})
export class TripsModule {}
