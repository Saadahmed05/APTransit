import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env";
import { BookingConfirmationService } from "./booking-confirmation.service";
import { FakePaymentProvider } from "./fake-payment.provider";
import { PAYMENT_PROVIDER, type PaymentProvider } from "./payment-provider";
import { PaymentsTestController } from "./payments-test.controller";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { RazorpayProvider } from "./razorpay.provider";

@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    BookingConfirmationService,
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService],
      // PAYMENTS_FAKE (dev and CI only, refused in production by env.ts): no call ever reaches Razorpay
      useFactory: (config: ConfigService<Env, true>): PaymentProvider =>
        config.get("PAYMENTS_FAKE", { infer: true }) ? new FakePaymentProvider() : new RazorpayProvider(config),
    },
  ],
  exports: [BookingConfirmationService, PaymentsService, PAYMENT_PROVIDER],
})
export class PaymentsModule {}

/** POST /payments/test/complete exists only when APP_ENV is not production and PAYMENTS_FAKE=1 (docs/06). */
export function paymentsFakeEnabled(env: NodeJS.ProcessEnv): boolean {
  // "1" from the raw env, "true" once ConfigModule has written back the validated flag
  return (env.PAYMENTS_FAKE === "1" || env.PAYMENTS_FAKE === "true") && env.APP_ENV !== "production";
}

/**
 * Dev and CI only. AppModule imports it through ConditionalModule.registerWhen(paymentsFakeEnabled),
 * which waits for ConfigModule to load .env (env.ts also refuses PAYMENTS_FAKE=1 in production).
 */
@Module({
  imports: [PaymentsModule],
  controllers: [PaymentsTestController],
})
export class PaymentsTestModule {}
