import { z } from "zod";
import { EligibilityResult, EligibilityScheme, PassKind, PassStatus, PassValidityMode, ServiceType } from "../enums";
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
  validityMode: PassValidityMode,
  /** People covered on the same trip (FAMILY 4). */
  groupSize: z.number().int().positive(),
  /** Needs a home and a destination stop at purchase (SCHOOL). */
  routeRestricted: z.boolean(),
  /** Placeholder price pending client confirmation (D-036): show a "Demo price" chip. */
  isDemo: z.boolean(),
  zoneScoped: z.boolean().optional(),
});
export type PassTypeDto = z.infer<typeof PassTypeDto>;

const PassStop = z.object({ id: z.string(), nameEn: z.string(), nameTe: z.string() });

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
  validityMode: PassValidityMode,
  groupSize: z.number().int().positive(),
  /** Route restricted passes only. */
  homeStop: PassStop.nullable(),
  destStop: PassStop.nullable(),
  /** D-042 zone pass: the one district it is valid in. */
  zoneDistrictId: z.string().nullable().optional(),
  /** D-042 child card: the child who travels; the account holder (parent) is told on each boarding. */
  holderName: z.string().nullable().optional(),
  holderAge: z.number().int().nullable().optional(),
  createdAt: z.string().datetime(),
  /** A READY pass must be activated before this moment (pass.activateWithinDays). */
  activateBy: z.string().datetime(),
  activatedAt: z.string().datetime().nullable(),
  validFrom: z.string().datetime().nullable(),
  validUntil: z.string().datetime().nullable(),
  /** validUntil the pass would get if activated now (for the confirmation). */
  activationValidUntil: z.string().datetime(),
  canActivate: z.boolean(),
});
export type PassDto = z.infer<typeof PassDto>;

/** D-042: a child card is a pass for a child under CHILD_CARD_MAX_AGE, bought by the parent. */
export const CHILD_CARD_MAX_AGE = 18;

export const CreatePassInput = z
  .object({
    passTypeId: PublicId,
    /** Route restricted passes (SCHOOL): where the student lives and the institution's stop. */
    homeStopId: PublicId.optional(),
    destStopId: PublicId.optional(),
    /** D-042: required when the pass type is zone scoped. */
    zoneDistrictId: PublicId.optional(),
    /** D-042: child card holder. */
    child: z
      .object({
        name: z.string().trim().min(1).max(100),
        age: z.coerce
          .number()
          .int()
          .min(1)
          .max(CHILD_CARD_MAX_AGE - 1),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((x) => Boolean(x.homeStopId) === Boolean(x.destStopId), { message: "Give both stops or neither" })
  .refine((x) => !x.homeStopId || x.homeStopId !== x.destStopId, { message: "Home and destination must differ" });
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

/**
 * POST /eligibility/student (D-036). Strict like Stree Shakti: the institution name goes to the
 * provider and is never stored; no student ID number is ever asked for.
 */
export const StudentCheckInput = z
  .object({
    consent: z.boolean(),
    declaration: z
      .object({
        isStudent: z.boolean(),
        institutionName: z.string().trim().max(120),
      })
      .strict(),
  })
  .strict();
export type StudentCheckInput = z.infer<typeof StudentCheckInput>;

/** Reason codes the mock providers give. The web maps each to plain words (freeTravel.reasons.*, schoolPass.reasons.*). */
export const EligibilityReasonCode = z.enum([
  "CONSENT_REQUIRED",
  "CATEGORY_NOT_COVERED",
  "DOMICILE_REQUIRED",
  "NOT_A_STUDENT",
  "INSTITUTION_REQUIRED",
]);
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
