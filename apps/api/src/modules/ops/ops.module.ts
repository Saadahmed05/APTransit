import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { PaymentsModule } from "../payments/payments.module";
import { OpsController } from "./ops.controller";
import { OpsService } from "./ops.service";
@Module({
  imports: [NotificationsModule, PaymentsModule],
  controllers: [OpsController],
  providers: [OpsService],
  exports: [OpsService],
})
export class OpsModule {}
