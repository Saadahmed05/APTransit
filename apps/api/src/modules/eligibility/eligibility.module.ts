import { Module } from "@nestjs/common";
import { ELIGIBILITY_PROVIDER, MockEligibilityProvider } from "./eligibility-provider";
import { EligibilityController } from "./eligibility.controller";
import { EligibilityService } from "./eligibility.service";

@Module({
  controllers: [EligibilityController],
  // MVP: the mock provider everywhere. A government provider replaces it here (docs/07 section 9)
  providers: [EligibilityService, { provide: ELIGIBILITY_PROVIDER, useClass: MockEligibilityProvider }],
  exports: [EligibilityService],
})
export class EligibilityModule {}
