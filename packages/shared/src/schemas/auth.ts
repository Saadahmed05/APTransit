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

/** D-048: which notification emails a citizen wants. In app notifications always arrive. */
export const NotificationPrefs = z.object({
  email: z.object({
    trips: z.boolean().default(true),
    tickets: z.boolean().default(true),
    passes: z.boolean().default(true),
    complaints: z.boolean().default(true),
  }),
});
export type NotificationPrefs = z.infer<typeof NotificationPrefs>;
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  email: { trips: true, tickets: true, passes: true, complaints: true },
};

/** D-048: a profile needs a name, a verified email and a phone (verified when phone codes work). */
export const ProfileField = z.enum(["name", "email", "phone"]);
export type ProfileField = z.infer<typeof ProfileField>;

export const MeDto = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  preferredLocale: z.string(),
  roles: z.array(UserRoleDto),
  emailVerified: z.boolean().default(false),
  phoneVerified: z.boolean().default(false),
  /** Defaults to true so a web build newer than the API never locks anyone out. */
  profileComplete: z.boolean().default(true),
  missing: z.array(ProfileField).default([]),
  notificationPrefs: NotificationPrefs.default(DEFAULT_NOTIFICATION_PREFS),
});
export type MeDto = z.infer<typeof MeDto>;

export const UpdateMeInput = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  preferredLocale: z.enum(["en", "te"]).optional(),
  notificationPrefs: NotificationPrefs.optional(),
});
export type UpdateMeInput = z.infer<typeof UpdateMeInput>;

/** D-048: POST /me/contact/otp/request, add or change the account email or phone. */
export const ContactOtpRequestInput = z
  .object({
    channel: OtpChannel,
    target: z.string().trim().min(1).max(254),
  })
  .superRefine((data, ctx) => {
    if (data.channel === "PHONE" && !phoneRegex.test(data.target))
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Phone number must be in +91 format followed by 10 digits", path: ["target"] });
    if (data.channel === "EMAIL" && !z.string().email().safeParse(data.target.toLowerCase()).success)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid email address", path: ["target"] });
  })
  .transform(lowerCaseEmail);
export type ContactOtpRequestInput = z.infer<typeof ContactOtpRequestInput>;

/**
 * `saved` is true when the phone was stored without a code because this environment cannot send
 * phone codes (no SMS provider yet, docs/18 G14). It shows as not verified on the account.
 */
export const ContactOtpRequestResponse = z.object({
  expiresInSec: z.number().int().nonnegative(),
  resendInSec: z.number().int().nonnegative(),
  devCode: z.string().optional(),
  saved: z.boolean().default(false),
});
export type ContactOtpRequestResponse = z.infer<typeof ContactOtpRequestResponse>;

export const ContactOtpVerifyInput = OtpVerifyInput;
export type ContactOtpVerifyInput = z.infer<typeof ContactOtpVerifyInput>;

/** D-048: GET /auth/sessions, one row per signed in device (refresh token family). */
export const SessionDto = z.object({
  id: z.string(),
  userAgent: z.string().nullable(),
  signedInAt: z.string().datetime(),
  lastActiveAt: z.string().datetime(),
  current: z.boolean(),
});
export type SessionDto = z.infer<typeof SessionDto>;
export const SessionsResponse = z.array(SessionDto);

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
