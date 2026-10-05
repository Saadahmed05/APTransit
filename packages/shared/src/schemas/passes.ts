import { z } from "zod";
import { EligibilityResult, EligibilityScheme, PassKind, PassStatus, ServiceType } from "../enums";
import { Paise } from "../money";
import { PublicId } from "./search";
import { TicketQrDto } from "./tickets";

/** GET /pass-types (public). */
export const PassTypeDto = z.object({
  id: z.string(),
  kind: PassKind,
  nameEn: z.string(),
  nameTe: z.string(),
  durationDays: z.number().int().positive(),
  pricePaise: Paise,
  eligibleServiceTypes: z.array(ServiceType),
  scheme: EligibilityScheme.nullable(),
});
export type PassTypeDto = z.infer<typeof PassTypeDto>;

/** GET /passes, POST /passes, POST /passes/:id/activate. */
export const PassDto = z.object({
  id: z.string(),
  code: z.string(),
  passTypeId: z.string(),
  kind: PassKind,
  nameEn: z.string(),
  nameTe: z.string(),
  status: PassStatus,
  pricePaise: Paise,
  durationDays: z.number().int().positive(),
  eligibleServiceTypes: z.array(ServiceType),
  createdAt: z.string().datetime(),
  /** A READY pass must be activated before this moment (pass.activateWithinDays). */
  activateBy: z.string().datetime(),
  activatedAt: z.string().datetime().nullable(),
  validFrom: z.string().datetime().nullable(),
  validUntil: z.string().datetime().nullable(),
  canActivate: z.boolean(),
});
export type PassDto = z.infer<typeof PassDto>;

export const CreatePassInput = z.object({
  passTypeId: PublicId,
});
export type CreatePassInput = z.infer<typeof CreatePassInput>;

/** GET /passes/:id/qr: same shape as the ticket QR. */
export const PassQrDto = TicketQrDto;
export type PassQrDto = TicketQrDto;

export const FreeTravelCategory = z.enum(["WOMAN", "GIRL", "TRANSGENDER"]);
export type FreeTravelCategory = z.infer<typeof FreeTravelCategory>;

/** Which photo ID the citizen will carry. Never the number itself. */
export const PhotoIdType = z.enum(["AADHAAR", "VOTER_ID", "RATION_CARD", "OTHER_PHOTO_ID"]);
export type PhotoIdType = z.infer<typeof PhotoIdType>;

/**
 * POST /eligibility/stree-shakti. Strict: an unknown key (an ID number, a date of birth, anything)
 * fails validation, so personal identifiers can never reach the server (docs/12, Identity data).
 */
export const StreeShaktiCheckInput = z
  .object({
    consent: z.boolean(),
    declaration: z
      .object({
        // A code, not free text: the provider decides which categories are covered (FreeTravelCategory today)
        category: z.string().regex(/^[A-Z_]{1,32}$/, "Category must be a code"),
        apDomicile: z.boolean(),
      })
      .strict(),
    idType: PhotoIdType,
  })
  .strict();
export type StreeShaktiCheckInput = z.infer<typeof StreeShaktiCheckInput>;

/** Reason codes the mock provider gives. The web maps each to plain words (freeTravel.reasons.*). */
export const EligibilityReasonCode = z.enum(["CONSENT_REQUIRED", "CATEGORY_NOT_COVERED", "DOMICILE_REQUIRED"]);
export type EligibilityReasonCode = z.infer<typeof EligibilityReasonCode>;

export const EligibilityCheckDto = z.object({
  checkId: z.string(),
  scheme: EligibilityScheme,
  result: EligibilityResult,
  reasonCode: z.string().nullable(),
  checkedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});
export type EligibilityCheckDto = z.infer<typeof EligibilityCheckDto>;

/** GET /eligibility: the latest check per scheme. */
export const EligibilityStatusDto = z.array(EligibilityCheckDto);
export type EligibilityStatusDto = z.infer<typeof EligibilityStatusDto>;
