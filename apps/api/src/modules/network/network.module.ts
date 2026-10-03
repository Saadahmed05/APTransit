import { Module } from "@nestjs/common";
import { RedisModule } from "../../redis/redis.module";
import { NetworkController } from "./network.controller";
import { NetworkRepository } from "./network.repository";
import { NetworkService } from "./network.service";

@Module({
  imports: [RedisModule],
  controllers: [NetworkController],
  providers: [NetworkService, NetworkRepository],
  exports: [NetworkService, NetworkRepository],
})
export class NetworkModule {}
