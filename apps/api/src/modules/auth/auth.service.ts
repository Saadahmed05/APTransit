import { randomBytes, randomInt, createHash, timingSafeEqual } from "node:crypto";
import {
  type AuthRefreshResponse,
  type AuthVerifyResponse,
  type ContactOtpRequestInput,
  type ContactOtpRequestResponse,
  type ContactOtpVerifyInput,
  DEFAULT_NOTIFICATION_PREFS,
  maskPhone,
  NotificationPrefs,
  type ProfileField,
  type SessionDto,
  type MeDto,
  type OtpRequestInput,
  type OtpRequestResponse,
  type OtpVerifyInput,
  type Role,
  type UpdateMeInput,
  type UserRoleDto,
} from "@aptransit/shared";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import * as jose from "jose";
import type { AuthenticatedUser } from "../../common/auth/auth.types";
import { AppError } from "../../common/errors/app-error";
import { RateLimitService } from "../../common/services/rate-limit.service";
import type { Env } from "../../config/env";
import { PrismaService } from "../../prisma/prisma.service";
import { RedisService } from "../../redis/redis.service";
import { AuditService } from "../audit/audit.service";
import { EMAIL_PROVIDER, type EmailProvider } from "./email.provider";

const OTP_TTL_SEC = 5 * 60;
const OTP_RESEND_SEC = 30;
const OTP_MAX_ATTEMPTS = 5;
const OTP_LOCK_SEC = 15 * 60;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LOGIN_PURPOSE = "LOGIN";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtSecret: Uint8Array;
  private readonly otpPepper: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService<Env, true>,
    private readonly rateLimit: RateLimitService,
    private readonly audit: AuditService,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
  ) {
    this.jwtSecret = new TextEncoder().encode(this.config.get("JWT_SECRET", { infer: true }));
    this.otpPepper = this.config.get("OTP_PEPPER", { infer: true });
  }

  private hashOtpCode(code: string): string {
    return createHash("sha256")
      .update(code + this.otpPepper)
      .digest("hex");
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private normaliseTarget(input: { channel: OtpRequestInput["channel"]; target: string }): string {
    const target = input.target.trim();
    return input.channel === "EMAIL" ? target.toLowerCase() : target;
  }

  /** Codes and targets reach the log only in local development (docs/12, A09). */
  private get isDevelopment(): boolean {
    return this.config.get("APP_ENV", { infer: true }) === "development";
  }

  private async generateAccessToken(
    userId: string,
    roles: { role: string; depotId?: string | null; districtId?: string | null }[],
  ): Promise<string> {
    return new jose.SignJWT({ roles })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(this.jwtSecret);
  }

  private async assertNotLocked(target: string): Promise<void> {
    try {
      const isLocked = await this.redis.client.get(`otp:lock:${target}`);
      if (isLocked) {
        throw new AppError(
          "OTP_TOO_MANY_ATTEMPTS",
          "Too many invalid attempts. Try again in 15 minutes.",
        );
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      // Redis unreachable: attempts are still capped per code in the database.
    }
  }

  /**
   * Checks and consumes the latest unused code for this channel, target and purpose. Wrong codes
   * count attempts and lock the target after OTP_MAX_ATTEMPTS (docs/12).
   */
  private async consumeCode(channel: OtpRequestInput["channel"], target: string, purpose: string, code: string): Promise<void> {
    await this.assertNotLocked(target);

    // Only the latest unused code counts; a new request makes older codes useless.
    const record = await this.prisma.otpCode.findFirst({
      where: { channel, target, purpose, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });

    if (!record || record.expiresAt < new Date()) {
      throw new AppError("OTP_EXPIRED", "That code has expired. Send a new code.");
    }

    // Covers the case where the Redis lock could not be written.
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      throw new AppError("OTP_TOO_MANY_ATTEMPTS", "Too many invalid attempts. Try again in 15 minutes.");
    }

    const candidateBuf = Buffer.from(this.hashOtpCode(code), "hex");
    const storedBuf = Buffer.from(record.codeHash, "hex");
    const matches = candidateBuf.length === storedBuf.length && timingSafeEqual(candidateBuf, storedBuf);

    if (!matches) {
      // Atomic increment: parallel wrong guesses cannot share one attempt.
      const { attempts } = await this.prisma.otpCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
        select: { attempts: true },
      });

      if (attempts >= OTP_MAX_ATTEMPTS) {
        try {
          await this.redis.client.set(`otp:lock:${target}`, "1", "EX", OTP_LOCK_SEC);
        } catch {
          // Redis unreachable: the attempts check above still blocks this code.
        }
        throw new AppError("OTP_TOO_MANY_ATTEMPTS", "Too many invalid attempts. Try again in 15 minutes.");
      }

      throw new AppError("OTP_INVALID", "That code is not right. Check the latest code and try again.");
    }

    // Consume atomically so one code can never be used twice (parallel verify requests).
    const consumed = await this.prisma.otpCode.updateMany({
      where: { id: record.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) {
      throw new AppError("OTP_EXPIRED", "That code has expired. Send a new code.");
    }
  }

  async requestOtp(
    input: OtpRequestInput,
    ip: string,
    res?: Response,
  ): Promise<OtpRequestResponse> {
    const target = this.normaliseTarget(input);

    await this.rateLimit.assertOtpRequestLimit(target, ip, res);
    await this.assertNotLocked(target);

    // Six digits, leading zeros allowed, uniform over 000000 to 999999.
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const codeHash = this.hashOtpCode(code);
    const expiresAt = new Date(Date.now() + OTP_TTL_SEC * 1000);

    await this.prisma.otpCode.create({
      data: {
        channel: input.channel,
        target,
        codeHash,
        expiresAt,
      },
    });

    const otpDevEcho = this.config.get("OTP_DEV_ECHO", { infer: true });
    const appEnv = this.config.get("APP_ENV", { infer: true });
    const devCode = otpDevEcho && appEnv !== "production" ? code : undefined;

    if (input.channel === "EMAIL") {
      try {
        await this.emailProvider.sendEmail(
          target,
          "Your AP TransitOS login code",
          `Your login code is ${code}. It is valid for 5 minutes. Never share this code with anyone.`,
        );
      } catch (err) {
        // With OTP_DEV_ECHO (never in production) the screen shows the code, so a failed email
        // does not block test logins while the sender domain is being set up.
        if (!(devCode && err instanceof AppError && err.code === "EMAIL_DELIVERY_FAILED")) throw err;
        this.logger.warn("Login email not delivered; the test code is shown on screen (OTP_DEV_ECHO)");
      }
    } else if (this.isDevelopment) {
      // No SMS provider yet (docs/18). Development only: the code goes to the local log.
      this.logger.log(`[Dev SMS] ${maskPhone(target)} code ${code}`);
    } else {
      this.logger.warn("SMS OTP requested but no SMS provider is configured");
    }

    return {
      expiresInSec: OTP_TTL_SEC,
      resendInSec: OTP_RESEND_SEC,
      ...(devCode ? { devCode } : {}),
    };
  }

  async verifyOtp(
    input: OtpVerifyInput,
    ip: string,
    userAgent?: string,
    res?: Response,
  ): Promise<AuthVerifyResponse & { refreshToken: string }> {
    const target = this.normaliseTarget(input);

    await this.rateLimit.assertOtpVerifyLimit(target, res);
    // D-048: only login codes log in; a contact verification code never does
    await this.consumeCode(input.channel, target, LOGIN_PURPOSE, input.code);

    return this.signIn(
      input.channel === "EMAIL" ? { email: target } : { phone: target },
      {
        phone: input.channel === "PHONE" ? target : null,
        email: input.channel === "EMAIL" ? target : null,
      },
      ip,
      userAgent,
      "otp",
    );
  }

  /**
   * D-043: Sign in with Google. The ID token is checked by Google (tokeninfo), then the audience,
   * issuer and verified email are checked here. Finds the account by email or creates a citizen.
   */
  async googleSignIn(
    credential: string,
    ip: string,
    userAgent?: string,
  ): Promise<AuthVerifyResponse & { refreshToken: string }> {
    const clientId = this.config.get("GOOGLE_CLIENT_ID", { infer: true });
    if (!clientId) throw new AppError("FORBIDDEN", "Google sign in is not set up");
    let claims: {
      aud?: string;
      iss?: string;
      email?: string;
      email_verified?: string | boolean;
      name?: string;
      exp?: string;
    };
    try {
      const res = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
        {
          signal: AbortSignal.timeout(5_000),
        },
      );
      if (!res.ok) throw new Error(`tokeninfo ${res.status}`);
      claims = (await res.json()) as typeof claims;
    } catch {
      throw new AppError("UNAUTHENTICATED", "Google sign in failed. Try again.");
    }
    const verified = claims.email_verified === true || claims.email_verified === "true";
    const issuerOk =
      claims.iss === "accounts.google.com" || claims.iss === "https://accounts.google.com";
    const notExpired = Number(claims.exp ?? 0) * 1000 > Date.now();
    if (claims.aud !== clientId || !issuerOk || !verified || !notExpired || !claims.email) {
      throw new AppError("UNAUTHENTICATED", "Google sign in failed. Try again.");
    }
    const email = claims.email.trim().toLowerCase();
    return this.signIn(
      { email },
      { email, phone: null, name: claims.name?.slice(0, 100) ?? null },
      ip,
      userAgent,
      "google",
    );
  }

  private async signIn(
    where: { email: string } | { phone: string },
    create: { email: string | null; phone: string | null; name?: string | null },
    ip: string,
    userAgent: string | undefined,
    method: "otp" | "google",
  ): Promise<AuthVerifyResponse & { refreshToken: string }> {
    // Find or create user
    let user = await this.prisma.user.findFirst({
      where,
      include: {
        userRoles: true,
      },
    });

    if (user?.deletedAt) {
      throw new AppError("FORBIDDEN", "This account has been deleted");
    }

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          ...create,
          preferredLocale: "en",
          userRoles: {
            create: [
              {
                role: "CITIZEN",
              },
            ],
          },
        },
        include: {
          userRoles: true,
        },
      });
    } else if (user.userRoles.length === 0) {
      const newRole = await this.prisma.userRole.create({
        data: {
          userId: user.id,
          role: "CITIZEN",
        },
      });
      user.userRoles.push(newRole);
    }

    // D-048: the channel used to log in is proven; stamp it once
    const proved = "email" in where ? "emailVerifiedAt" : "phoneVerifiedAt";
    if (!user[proved]) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { [proved]: new Date() },
        include: { userRoles: true },
      });
    }

    const rolesPayload = user.userRoles.map((r) => ({
      role: r.role,
      depotId: r.depotId,
      districtId: r.districtId,
      stateId: r.stateId,
    }));
    const accessToken = await this.generateAccessToken(user.id, rolesPayload);

    const rawRefreshToken = randomBytes(32).toString("hex");
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(rawRefreshToken),
        familyId: randomBytes(16).toString("hex"),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        userAgent,
      },
    });

    await this.audit.log({
      action: "auth.login",
      entityType: "user",
      entityId: user.id,
      after: { method },
      actorUserId: user.id,
      actorRole: user.userRoles[0]?.role ?? "CITIZEN",
      ip,
      userAgent,
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      user: this.formatMeDto(user),
    };
  }

  async refresh(
    rawRefreshToken: string,
    ip?: string,
    userAgent?: string,
    res?: Response,
  ): Promise<AuthRefreshResponse & { newRefreshToken: string }> {
    const tokenRecord = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(rawRefreshToken) },
    });

    if (!tokenRecord) {
      throw new AppError("UNAUTHENTICATED", "Invalid refresh token");
    }

    await this.rateLimit.assertRefreshLimit(tokenRecord.userId, res);

    if (tokenRecord.revokedAt !== null) {
      await this.revokeFamilyForReuse(tokenRecord, ip, userAgent);
    }

    if (tokenRecord.expiresAt < new Date()) {
      throw new AppError("UNAUTHENTICATED", "Refresh token expired");
    }

    // Claim the token atomically. Two requests racing with the same token: only one rotates,
    // the other gets 401 (and any later use of this token is treated as reuse).
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: tokenRecord.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count !== 1) {
      throw new AppError("UNAUTHENTICATED", "Refresh token already used");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: tokenRecord.userId },
      include: { userRoles: true },
    });

    if (!user || user.deletedAt) {
      throw new AppError("UNAUTHENTICATED", "User not found");
    }

    const newRawRefreshToken = randomBytes(32).toString("hex");
    const newRecord = await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(newRawRefreshToken),
        familyId: tokenRecord.familyId,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        userAgent,
      },
    });

    await this.prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { replacedById: newRecord.id },
    });

    const rolesPayload = user.userRoles.map((r) => ({
      role: r.role,
      depotId: r.depotId,
      districtId: r.districtId,
      stateId: r.stateId,
    }));
    const accessToken = await this.generateAccessToken(user.id, rolesPayload);

    return {
      accessToken,
      newRefreshToken: newRawRefreshToken,
    };
  }

  private async revokeFamilyForReuse(
    tokenRecord: { id: string; familyId: string; userId: string },
    ip?: string,
    userAgent?: string,
  ): Promise<never> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId: tokenRecord.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.audit.log({
      action: "auth.refresh_reuse_detected",
      entityType: "refresh_token",
      entityId: tokenRecord.id,
      actorUserId: tokenRecord.userId,
      ip,
      userAgent,
    });

    throw new AppError("UNAUTHENTICATED", "Refresh token reuse detected");
  }

  async logout(
    rawRefreshToken?: string,
    user?: AuthenticatedUser | null,
    ip?: string,
    userAgent?: string,
  ): Promise<void> {
    if (rawRefreshToken) {
      const tokenRecord = await this.prisma.refreshToken.findUnique({
        where: { tokenHash: this.hashToken(rawRefreshToken) },
      });

      if (tokenRecord) {
        await this.prisma.refreshToken.updateMany({
          where: { familyId: tokenRecord.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });

        await this.audit.log({
          action: "auth.logout",
          entityType: "user",
          entityId: tokenRecord.userId,
          actorUserId: tokenRecord.userId,
          actorRole: user?.id === tokenRecord.userId ? (user.roles[0]?.role ?? null) : null,
          ip,
          userAgent,
        });
        return;
      }
    }

    if (user) {
      await this.audit.log({
        action: "auth.logout",
        entityType: "user",
        entityId: user.id,
        actorUserId: user.id,
        actorRole: user.roles[0]?.role ?? null,
        ip,
        userAgent,
      });
    }
  }

  async getMe(userId: string): Promise<MeDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { userRoles: true },
    });

    if (!user || user.deletedAt) {
      throw new AppError("NOT_FOUND", "User not found");
    }

    return this.formatMeDto(user);
  }

  async updateMe(userId: string, input: UpdateMeInput): Promise<MeDto> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.preferredLocale ? { preferredLocale: input.preferredLocale } : {}),
        ...(input.notificationPrefs ? { notificationPrefs: input.notificationPrefs } : {}),
      },
      include: { userRoles: true },
    });

    return this.formatMeDto(user);
  }

  /**
   * Phone codes reach the user only through an SMS provider (none yet, docs/18 G14) or, outside
   * production, the dev echo and the local log. Without them a phone is stored unverified.
   */
  private get phoneCodesWork(): boolean {
    const devEcho = this.config.get("OTP_DEV_ECHO", { infer: true }) && this.config.get("APP_ENV", { infer: true }) !== "production";
    return this.isDevelopment || Boolean(devEcho);
  }

  /**
   * What a citizen still has to add before the profile is complete: a name. The email or phone
   * they signed in with is already verified, so nobody is asked for a second contact (adding one
   * that belongs to another account used to fail with "belongs to another account"). More contacts
   * stay optional on the account page.
   */
  private missingFields(user: { name: string | null; email: string | null; phone: string | null; emailVerifiedAt: Date | null; phoneVerifiedAt: Date | null }): ProfileField[] {
    const missing: ProfileField[] = [];
    if (!user.name?.trim()) missing.push("name");
    const hasContact = Boolean(user.email && user.emailVerifiedAt) || Boolean(user.phone && (user.phoneVerifiedAt || !this.phoneCodesWork));
    if (!hasContact) missing.push("email");
    return missing;
  }

  private formatMeDto(user: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    preferredLocale: string;
    emailVerifiedAt: Date | null;
    phoneVerifiedAt: Date | null;
    notificationPrefs: unknown;
    userRoles: { role: string; depotId: string | null; districtId: string | null; stateId: string | null }[];
  }): MeDto {
    const roles: UserRoleDto[] = user.userRoles.map((r) => ({
      role: r.role as Role,
      depotId: r.depotId,
      districtId: r.districtId,
      stateId: r.stateId,
    }));
    const missing = this.missingFields(user);
    const prefs = NotificationPrefs.safeParse(user.notificationPrefs);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone ? maskPhone(user.phone) : null,
      preferredLocale: user.preferredLocale,
      roles,
      emailVerified: Boolean(user.email && user.emailVerifiedAt),
      phoneVerified: Boolean(user.phone && user.phoneVerifiedAt),
      profileComplete: missing.length === 0,
      missing,
      notificationPrefs: prefs.success ? prefs.data : DEFAULT_NOTIFICATION_PREFS,
    };
  }

  /**
   * D-048: POST /me/contact/otp/request. Sends a code to a new email or phone for this account.
   * Without phone codes (no SMS provider) a phone is stored right away, unverified.
   */
  async requestContactOtp(userId: string, input: ContactOtpRequestInput, ip: string, res?: Response): Promise<ContactOtpRequestResponse> {
    const target = this.normaliseTarget(input);
    const field = input.channel === "EMAIL" ? "email" : "phone";
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw new AppError("NOT_FOUND", "User not found");
    const verifiedAt = field === "email" ? user.emailVerifiedAt : user.phoneVerifiedAt;
    if (user[field] === target && verifiedAt) throw new AppError("VALIDATION_FAILED", "This is already your verified contact");
    await this.assertContactFree(field, target, userId);

    if (input.channel === "PHONE" && !this.phoneCodesWork) {
      await this.saveContact(userId, field, target, null);
      return { expiresInSec: 0, resendInSec: 0, saved: true };
    }

    await this.rateLimit.assertOtpRequestLimit(target, ip, res);
    await this.assertNotLocked(target);
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await this.prisma.otpCode.create({
      data: {
        channel: input.channel,
        target,
        codeHash: this.hashOtpCode(code),
        purpose: contactPurpose(userId),
        expiresAt: new Date(Date.now() + OTP_TTL_SEC * 1000),
      },
    });
    const otpDevEcho = this.config.get("OTP_DEV_ECHO", { infer: true });
    const devCode = otpDevEcho && this.config.get("APP_ENV", { infer: true }) !== "production" ? code : undefined;
    if (input.channel === "EMAIL") {
      try {
        await this.emailProvider.sendEmail(
          target,
          "Your AP TransitOS verification code",
          `Your code to add this email to your AP TransitOS account is ${code}. It is valid for 5 minutes. Never share this code with anyone.`,
        );
      } catch (err) {
        if (!(devCode && err instanceof AppError && err.code === "EMAIL_DELIVERY_FAILED")) throw err;
        this.logger.warn("Verification email not delivered; the test code is shown on screen (OTP_DEV_ECHO)");
      }
    } else if (this.isDevelopment) {
      this.logger.log(`[Dev SMS] ${maskPhone(target)} code ${code}`);
    }
    return { expiresInSec: OTP_TTL_SEC, resendInSec: OTP_RESEND_SEC, saved: false, ...(devCode ? { devCode } : {}) };
  }

  /** D-048: POST /me/contact/otp/verify. A right code sets and verifies the email or phone. */
  async verifyContactOtp(userId: string, input: ContactOtpVerifyInput, ip: string, userAgent?: string, res?: Response): Promise<MeDto> {
    const target = this.normaliseTarget(input);
    const field = input.channel === "EMAIL" ? "email" : "phone";
    await this.rateLimit.assertOtpVerifyLimit(target, res);
    await this.consumeCode(input.channel, target, contactPurpose(userId), input.code);
    const user = await this.saveContact(userId, field, target, new Date());
    await this.audit.log({
      action: "user.contact_verify",
      entityType: "user",
      entityId: userId,
      after: { field },
      actorUserId: userId,
      ip,
      userAgent,
    });
    return this.formatMeDto(user);
  }

  private async assertContactFree(field: "email" | "phone", target: string, userId: string): Promise<void> {
    const owner = await this.prisma.user.findFirst({
      where: field === "email" ? { email: target } : { phone: target },
      select: { id: true },
    });
    if (owner && owner.id !== userId) throw new AppError("CONTACT_IN_USE", "This contact belongs to another account");
  }

  private async saveContact(userId: string, field: "email" | "phone", target: string, verifiedAt: Date | null) {
    await this.assertContactFree(field, target, userId);
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: field === "email" ? { email: target, emailVerifiedAt: verifiedAt } : { phone: target, phoneVerifiedAt: verifiedAt },
        include: { userRoles: true },
      });
    } catch (err) {
      // Two accounts verifying the same contact at once: the unique index decides
      if ((err as { code?: string }).code === "P2002") throw new AppError("CONTACT_IN_USE", "This contact belongs to another account");
      throw err;
    }
  }

  /** D-048: GET /auth/sessions, one row per signed in device (refresh token family). */
  async sessions(userId: string, rawRefreshToken?: string): Promise<SessionDto[]> {
    const now = new Date();
    const active = await this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now } },
      select: { familyId: true, userAgent: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    const families = [...new Set(active.map((t) => t.familyId))];
    if (families.length === 0) return [];
    const first = await this.prisma.refreshToken.groupBy({
      by: ["familyId"],
      where: { familyId: { in: families } },
      _min: { createdAt: true },
    });
    const startedAt = new Map(first.map((f) => [f.familyId, f._min.createdAt]));
    const current = rawRefreshToken
      ? (await this.prisma.refreshToken.findUnique({ where: { tokenHash: this.hashToken(rawRefreshToken) }, select: { familyId: true } }))?.familyId
      : undefined;
    return families.map((familyId) => {
      const latest = active.find((t) => t.familyId === familyId)!;
      return {
        id: familyId,
        userAgent: latest.userAgent ?? null,
        signedInAt: (startedAt.get(familyId) ?? latest.createdAt).toISOString(),
        lastActiveAt: latest.createdAt.toISOString(),
        current: familyId === current,
      };
    });
  }

  /** D-048: POST /auth/sessions/revoke-others. Every other device has to sign in again. */
  async revokeOtherSessions(user: AuthenticatedUser, rawRefreshToken: string | undefined, ip?: string, userAgent?: string): Promise<number> {
    const current = rawRefreshToken
      ? (await this.prisma.refreshToken.findUnique({ where: { tokenHash: this.hashToken(rawRefreshToken) }, select: { familyId: true, userId: true } }))
      : null;
    const keep = current?.userId === user.id ? current.familyId : undefined;
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null, ...(keep ? { familyId: { not: keep } } : {}) },
      data: { revokedAt: new Date() },
    });
    await this.audit.log({
      action: "auth.logout_others",
      entityType: "user",
      entityId: user.id,
      after: { revoked: result.count },
      actorUserId: user.id,
      actorRole: user.roles[0]?.role ?? null,
      ip,
      userAgent,
    });
    return result.count;
  }
}

/** Contact codes are bound to the account that asked for them, and never log anyone in. */
function contactPurpose(userId: string): string {
  return `CONTACT:${userId}`;
}
