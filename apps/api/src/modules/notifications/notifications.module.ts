import { Module } from "@nestjs/common";
import { EMAIL_PROVIDER, ResendEmailProvider } from "../auth/email.provider";
import { QueueModule } from "../queue/queue.module";
import { NotificationEmailService } from "./notification-email.service";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { NotificationsSubscriber } from "./notifications.subscriber";

@Module({
  imports: [QueueModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsSubscriber,
    NotificationEmailService,
    { provide: EMAIL_PROVIDER, useClass: ResendEmailProvider },
  ],
  exports: [NotificationsService, NotificationEmailService],
})
export class NotificationsModule {}
