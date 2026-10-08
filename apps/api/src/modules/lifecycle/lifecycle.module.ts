import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { StatusExpiryService } from "./status-expiry.service";
import { RetentionService } from "./retention.service";

@Module({
  imports: [NotificationsModule],
  providers: [StatusExpiryService, RetentionService],
  exports: [StatusExpiryService, RetentionService],
})
export class LifecycleModule {}
