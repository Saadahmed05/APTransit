import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { RetentionService } from "../../lifecycle/retention.service";
import { TripGeneratorService } from "../../trips/trip-generator.service";
import { QUEUES } from "../queue.constants";
import { QueueStatusService } from "../queue-status.service";
import { bullmqProcessorOptions } from "../worker-options";

export const RETENTION_JOB = "retention";
export const FAILED_JOBS_SUMMARY_JOB = "failed-jobs-summary";

@Processor(QUEUES.MAINTENANCE, bullmqProcessorOptions())
export class MaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger(MaintenanceProcessor.name);

  constructor(
    private readonly tripGeneratorService: TripGeneratorService,
    private readonly retention: RetentionService,
    private readonly queues: QueueStatusService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === "generate-trips") {
      this.logger.log("Running generate-trips maintenance job (7 days ahead)");
      await this.tripGeneratorService.generateTripsForFutureDays(7);
    } else if (job.name === RETENTION_JOB) {
      await this.retention.run();
    } else if (job.name === FAILED_JOBS_SUMMARY_JOB) {
      // One line a day for the logs (Day 18): failed counts per queue and the latest reasons
      const [depths, failed] = await Promise.all([this.queues.depths(), this.queues.failed(5)]);
      const counts = Object.fromEntries(Object.entries(depths).map(([q, d]) => [q, d.failed]));
      this.logger.log(`Failed jobs summary ${JSON.stringify({ counts, latest: failed.map((f) => `${f.queue}/${f.name}: ${f.reason}`) })}`);
    }
  }
}
