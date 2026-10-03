import { Module } from "@nestjs/common";
import { BookingConfirmationService } from "./booking-confirmation.service";
import { PAYMENT_PROVIDER } from "./payment-provider";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { RazorpayProvider } from "./razorpay.provider";

@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    BookingConfirmationService,
    { provide: PAYMENT_PROVIDER, useClass: RazorpayProvider },
  ],
  exports: [BookingConfirmationService],
})
export class PaymentsModule {}
