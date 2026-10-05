import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { StatusExpiryService } from "./status-expiry.service";

@Module({
  imports: [NotificationsModule],
  providers: [StatusExpiryService],
  exports: [StatusExpiryService],
})
export class LifecycleModule {}
