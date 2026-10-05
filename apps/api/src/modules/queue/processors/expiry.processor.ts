import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { BookingsService } from "../../bookings/bookings.service";
import { StatusExpiryService } from "../../lifecycle/status-expiry.service";
import { QUEUES } from "../queue.constants";
import { bullmqProcessorOptions } from "../worker-options";

/** Repeatable every 5 min (worker.ts): tickets and passes that ran out of time (Day 9). */
export const EXPIRE_STATUSES_JOB = "expire-statuses";

@Processor(QUEUES.EXPIRY, bullmqProcessorOptions())
export class ExpiryProcessor extends WorkerHost {
  private readonly logger = new Logger(ExpiryProcessor.name);

  constructor(
    private readonly bookingsService: BookingsService,
    private readonly statusExpiry: StatusExpiryService,
  ) {
    super();
  }

  async process(job: Job<{ bookingId: string }>): Promise<void> {
    if (job.name === "booking-hold-expired") {
      this.logger.log(`Processing hold expiry for booking ${job.data.bookingId}`);
      await this.bookingsService.releaseExpiredHold(job.data.bookingId);
    } else if (job.name === EXPIRE_STATUSES_JOB) {
      await this.statusExpiry.runAll();
    }
  }
}
