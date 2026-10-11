import { randomBytes } from "node:crypto";
import { type EligibilityReasonCode, FreeTravelCategory, type StreeShaktiCheckInput, type StudentCheckInput } from "@aptransit/shared";

export const ELIGIBILITY_PROVIDER = Symbol("ELIGIBILITY_PROVIDER");

export interface EligibilityDecision {
  result: "ELIGIBLE" | "NOT_ELIGIBLE";
  reasonCode: EligibilityReasonCode | null;
  /** The provider's own reference for the check. Never an identity number. */
  providerRef: string | null;
}

/**
 * docs/07 section 9: the scheme decides eligibility, not us. MVP uses the mock; a government
 * provider plugs in behind the same interface later (plan sec 51). Input never carries an ID number.
 */
export interface EligibilityProvider {
  readonly name: string;
  checkStreeShakti(input: StreeShaktiCheckInput): Promise<EligibilityDecision>;
  /** D-036 school pass. The institution name is for the provider only; it is never stored. */
  checkStudent(input: StudentCheckInput): Promise<EligibilityDecision>;
}

/** ELIGIBLE when consent is given, the category is covered and the citizen declares AP domicile. */
export class MockEligibilityProvider implements EligibilityProvider {
  readonly name = "MOCK";

  async checkStreeShakti(input: StreeShaktiCheckInput): Promise<EligibilityDecision> {
    const ref = `mock_${randomBytes(6).toString("hex")}`;
    if (!input.consent) return { result: "NOT_ELIGIBLE", reasonCode: "CONSENT_REQUIRED", providerRef: ref };
    if (!FreeTravelCategory.safeParse(input.declaration.category).success) {
      return { result: "NOT_ELIGIBLE", reasonCode: "CATEGORY_NOT_COVERED", providerRef: ref };
    }
    if (!input.declaration.apDomicile) return { result: "NOT_ELIGIBLE", reasonCode: "DOMICILE_REQUIRED", providerRef: ref };
    return { result: "ELIGIBLE", reasonCode: null, providerRef: ref };
  }

  /** ELIGIBLE with consent, a student declaration and an institution name (D-036, DEMO rule). */
  async checkStudent(input: StudentCheckInput): Promise<EligibilityDecision> {
    const ref = `mock_${randomBytes(6).toString("hex")}`;
    if (!input.consent) return { result: "NOT_ELIGIBLE", reasonCode: "CONSENT_REQUIRED", providerRef: ref };
    if (!input.declaration.isStudent) return { result: "NOT_ELIGIBLE", reasonCode: "NOT_A_STUDENT", providerRef: ref };
    if (input.declaration.institutionName.trim().length < 2) {
      return { result: "NOT_ELIGIBLE", reasonCode: "INSTITUTION_REQUIRED", providerRef: ref };
    }
    return { result: "ELIGIBLE", reasonCode: null, providerRef: ref };
  }
}
