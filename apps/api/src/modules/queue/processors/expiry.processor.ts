import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { BookingsService } from "../../bookings/bookings.service";
import { QUEUES } from "../queue.constants";
import { bullmqProcessorOptions } from "../worker-options";

@Processor(QUEUES.EXPIRY, bullmqProcessorOptions())
export class ExpiryProcessor extends WorkerHost {
  private readonly logger = new Logger(ExpiryProcessor.name);

  constructor(private readonly bookingsService: BookingsService) {
    super();
  }

  async process(job: Job<{ bookingId: string }>): Promise<void> {
    if (job.name === "booking-hold-expired") {
      this.logger.log(`Processing hold expiry for booking ${job.data.bookingId}`);
      await this.bookingsService.releaseExpiredHold(job.data.bookingId);
    }
  }
}
