import { Module } from "@nestjs/common";
import { PaymentsModule } from "../payments/payments.module";
import { QrService } from "./qr.service";
import { TicketsController } from "./tickets.controller";
import { TicketsService } from "./tickets.service";

@Module({
  imports: [PaymentsModule],
  controllers: [TicketsController],
  providers: [TicketsService, QrService],
  exports: [TicketsService, QrService],
})
export class TicketsModule {}
