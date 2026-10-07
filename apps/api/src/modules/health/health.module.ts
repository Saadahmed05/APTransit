import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { QueueModule } from "../queue/queue.module";
import { HealthService } from "./health.service";

@Module({
  imports: [QueueModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
