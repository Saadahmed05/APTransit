import { z } from "zod";
import { CODE_PATTERNS } from "../codes";
import { ComplaintStatus, FeedbackCategory } from "../enums";
import { PublicId, ServiceDateString } from "./search";

const iso = z.string().datetime();
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? undefined : v))
    .optional();

/** POST /feedback (docs/06 Feedback, plan sec 40). Public; the user is attached when logged in. */
export const FeedbackInput = z.strictObject({
  email,
  category: FeedbackCategory,
  message: z.string().trim().min(10, "At least 10 characters").max(2000, "At most 2000 characters"),
  ticketCode: optionalText(20).pipe(z.string().toUpperCase().regex(CODE_PATTERNS.ticket).optional()),
  busRegNo: optionalText(20),
  routeCode: optionalText(20).pipe(z.string().toUpperCase().optional()),
  // An empty date field means no date, like the other optional details
  travelDate: z.preprocess((v) => (v === "" ? undefined : v), ServiceDateString.optional()),
});
export type FeedbackInput = z.infer<typeof FeedbackInput>;

export const FeedbackCreatedDto = z.object({ code: z.string().regex(CODE_PATTERNS.complaint) });
export type FeedbackCreatedDto = z.infer<typeof FeedbackCreatedDto>;

/** GET /feedback/status: both must match, else NOT_FOUND (never says which part was wrong). */
export const FeedbackStatusQuery = z.strictObject({
  code: z.string().trim().toUpperCase().regex(CODE_PATTERNS.complaint, "Complaint code looks like CMP-ABC123"),
  email,
});
export type FeedbackStatusQuery = z.infer<typeof FeedbackStatusQuery>;

export const FeedbackStatusDto = z.object({
  code: z.string(),
  status: ComplaintStatus,
  category: FeedbackCategory,
  createdAt: iso,
  updatedAt: iso,
  resolvedAt: iso.nullable(),
  resolutionNote: z.string().nullable(),
});
export type FeedbackStatusDto = z.infer<typeof FeedbackStatusDto>;

export const ComplaintDto = z.object({
  id: PublicId,
  code: z.string(),
  email: z.string(),
  category: FeedbackCategory,
  status: ComplaintStatus,
  message: z.string(),
  ticketCode: z.string().nullable(),
  busRegNo: z.string().nullable(),
  routeCode: z.string().nullable(),
  travelDate: z.string().nullable(),
  depotId: PublicId.nullable(),
  depotNameEn: z.string().nullable(),
  depotNameTe: z.string().nullable(),
  assignedToId: PublicId.nullable(),
  assignedToName: z.string().nullable(),
  resolutionNote: z.string().nullable(),
  resolvedAt: iso.nullable(),
  createdAt: iso,
  updatedAt: iso,
});
export type ComplaintDto = z.infer<typeof ComplaintDto>;

export const OpsComplaintsQuery = z.strictObject({
  status: ComplaintStatus.optional(),
  depotId: PublicId.optional(),
});
export type OpsComplaintsQuery = z.infer<typeof OpsComplaintsQuery>;

/** PATCH /ops/complaints/:id. A note is required when the status becomes RESOLVED. */
export const UpdateComplaintInput = z
  .strictObject({
    status: ComplaintStatus.optional(),
    resolutionNote: z.string().trim().min(5).max(1000).optional(),
    assignedToId: PublicId.nullable().optional(),
  })
  .refine((v) => v.status !== undefined || v.resolutionNote !== undefined || v.assignedToId !== undefined, {
    message: "Nothing to change",
  })
  .refine((v) => v.status !== "RESOLVED" || v.resolutionNote !== undefined, {
    message: "A resolution note is required to resolve",
    path: ["resolutionNote"],
  });
export type UpdateComplaintInput = z.infer<typeof UpdateComplaintInput>;

/** Status moves one step forward only: RECEIVED, IN_REVIEW, RESOLVED, CLOSED (Day 16). */
export const COMPLAINT_NEXT_STATUS: Readonly<Record<ComplaintStatus, ComplaintStatus | null>> = {
  RECEIVED: "IN_REVIEW",
  IN_REVIEW: "RESOLVED",
  RESOLVED: "CLOSED",
  CLOSED: null,
};

export function canMoveComplaint(from: ComplaintStatus, to: ComplaintStatus): boolean {
  return from === to || COMPLAINT_NEXT_STATUS[from] === to;
}
