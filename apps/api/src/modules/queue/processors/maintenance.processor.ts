import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { TripGeneratorService } from "../../trips/trip-generator.service";
import { QUEUES } from "../queue.constants";
import { bullmqProcessorOptions } from "../worker-options";

@Processor(QUEUES.MAINTENANCE, bullmqProcessorOptions())
export class MaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger(MaintenanceProcessor.name);

  constructor(private readonly tripGeneratorService: TripGeneratorService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === "generate-trips") {
      this.logger.log("Running generate-trips maintenance job (7 days ahead)");
      await this.tripGeneratorService.generateTripsForFutureDays(7);
    }
  }
}
