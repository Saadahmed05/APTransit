import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { NotificationEmailService } from "../../notifications/notification-email.service";
import { type ComplaintEmailJob, SEND_COMPLAINT_EMAIL_JOB, SEND_EMAIL_JOB } from "../../notifications/notifications.service";
import { QUEUES } from "../queue.constants";
import { bullmqProcessorOptions } from "../worker-options";

@Processor(QUEUES.NOTIFICATIONS, bullmqProcessorOptions())
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(private readonly emails: NotificationEmailService) {
    super();
  }

  async process(job: Job<{ notificationId: string } | ComplaintEmailJob>): Promise<void> {
    if (job.name === SEND_COMPLAINT_EMAIL_JOB) {
      await this.emails.sendComplaint(job.data as ComplaintEmailJob);
      return;
    }
    if (job.name !== SEND_EMAIL_JOB) {
      this.logger.warn(`Unknown notifications job ${job.name}`);
      return;
    }
    // Throws on a delivery failure, so BullMQ retries with backoff
    await this.emails.send((job.data as { notificationId: string }).notificationId);
  }
}
