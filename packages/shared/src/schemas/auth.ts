import { z } from "zod";
import { OtpChannel, Role } from "../enums";

/**
 * Validates phone numbers in +91 format followed by 10 digits.
 */
export const phoneRegex = /^\+91\d{10}$/;

/**
 * Masks a phone number to hide digits: +919876543210 -> +91******3210
 */
export function maskPhone(phone: string): string {
  if (phone.length <= 6) return phone;
  const prefix = phone.slice(0, 3);
  const suffix = phone.slice(-4);
  const maskedCount = Math.max(0, phone.length - 7);
  return `${prefix}${"*".repeat(maskedCount)}${suffix}`;
}

/**
 * Masks an email: user@example.com -> u***@example.com
 */
export function maskEmail(email: string): string {
  const atIdx = email.indexOf("@");
  if (atIdx <= 1) return email;
  const first = email[0];
  const domain = email.slice(atIdx);
  return `${first}***${domain}`;
}

/** Emails are compared lower cased everywhere (docs/05: users.email is unique). */
const lowerCaseEmail = <T extends { channel: string; target: string }>(data: T): T =>
  data.channel === "EMAIL" ? { ...data, target: data.target.toLowerCase() } : data;

export const OtpRequestInput = z
  .object({
    channel: OtpChannel,
    target: z.string().trim().min(1).max(254),
  })
  .superRefine((data, ctx) => {
    if (data.channel === "PHONE") {
      if (!phoneRegex.test(data.target)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Phone number must be in +91 format followed by 10 digits",
          path: ["target"],
        });
      }
    } else if (data.channel === "EMAIL") {
      const emailCheck = z.string().email().safeParse(data.target.toLowerCase());
      if (!emailCheck.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid email address",
          path: ["target"],
        });
      }
    }
  })
  .transform(lowerCaseEmail);
export type OtpRequestInput = z.infer<typeof OtpRequestInput>;

export const OtpVerifyInput = z
  .object({
    channel: OtpChannel,
    target: z.string().trim().min(1).max(254),
    code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
  })
  .superRefine((data, ctx) => {
    if (data.channel === "PHONE") {
      if (!phoneRegex.test(data.target)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Phone number must be in +91 format followed by 10 digits",
          path: ["target"],
        });
      }
    } else if (data.channel === "EMAIL") {
      const emailCheck = z.string().email().safeParse(data.target.toLowerCase());
      if (!emailCheck.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid email address",
          path: ["target"],
        });
      }
    }
  })
  .transform(lowerCaseEmail);
export type OtpVerifyInput = z.infer<typeof OtpVerifyInput>;

/** D-043: POST /auth/google. The Google Identity Services ID token (a JWT), checked by the API with Google. */
export const GoogleSignInInput = z.object({ credential: z.string().min(20).max(4096) }).strict();
export type GoogleSignInInput = z.infer<typeof GoogleSignInInput>;

export const UserRoleDto = z.object({
  role: Role,
  depotId: z.string().nullable().optional(),
  districtId: z.string().nullable().optional(),
  stateId: z.string().nullable().optional(),
});
export type UserRoleDto = z.infer<typeof UserRoleDto>;

export const MeDto = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  preferredLocale: z.string(),
  roles: z.array(UserRoleDto),
});
export type MeDto = z.infer<typeof MeDto>;

export const UpdateMeInput = z.object({
  name: z.string().min(1).max(100).optional(),
  preferredLocale: z.enum(["en", "te"]).optional(),
});
export type UpdateMeInput = z.infer<typeof UpdateMeInput>;

export const OtpRequestResponse = z.object({
  expiresInSec: z.number().int().positive(),
  resendInSec: z.number().int().positive(),
  devCode: z.string().optional(),
});
export type OtpRequestResponse = z.infer<typeof OtpRequestResponse>;

export const AuthVerifyResponse = z.object({
  accessToken: z.string(),
  user: MeDto,
});
export type AuthVerifyResponse = z.infer<typeof AuthVerifyResponse>;

export const AuthRefreshResponse = z.object({
  accessToken: z.string(),
});
export type AuthRefreshResponse = z.infer<typeof AuthRefreshResponse>;
