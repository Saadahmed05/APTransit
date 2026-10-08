import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { FeedbackController, OpsComplaintsController } from "./feedback.controller";
import { FeedbackService } from "./feedback.service";

@Module({
  imports: [AuditModule, AuthModule, NotificationsModule],
  controllers: [FeedbackController, OpsComplaintsController],
  providers: [FeedbackService],
  exports: [FeedbackService],
})
export class FeedbackModule {}