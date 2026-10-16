import {
  type AuthRefreshResponse,
  type AuthVerifyResponse,
  ContactOtpRequestInput,
  type ContactOtpRequestResponse,
  ContactOtpVerifyInput,
  type MeDto,
  type SessionDto,
  OtpRequestInput,
  type OtpRequestResponse,
  GoogleSignInInput,
  OtpVerifyInput,
  UpdateMeInput,
} from "@aptransit/shared";
import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import type { AuthenticatedUser } from "../../common/auth/auth.types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { AppError } from "../../common/errors/app-error";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { Env } from "../../config/env";
import { AuthService } from "./auth.service";

function getRefreshTokenFromReq(req: Request): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(/(?:^|;\s*)apt_rt=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

const REFRESH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** D-016: marker with no secret so the web proxy (path /) can tell a session exists. apt_rt is scoped to /api/v1/auth. */
export const SESSION_MARKER_COOKIE = "apt_session";

// docs/06: httpOnly, Secure, SameSite=Lax, path /api/v1/auth, 30 days. Only local development
// over plain http drops Secure (Safari refuses Secure cookies on http://localhost).
function setRefreshTokenCookie(res: Response, token: string, secure: boolean) {
  res.cookie("apt_rt", token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/api/v1/auth",
    maxAge: REFRESH_MAX_AGE_MS,
  });
  res.cookie(SESSION_MARKER_COOKIE, "1", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: REFRESH_MAX_AGE_MS,
  });
}

function clearRefreshTokenCookie(res: Response, secure: boolean) {
  res.clearCookie("apt_rt", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/api/v1/auth",
  });
  res.clearCookie(SESSION_MARKER_COOKIE, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
  });
}

@Controller()
export class AuthController {
  private readonly secureCookie: boolean;

  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {
    this.secureCookie = this.config.get("APP_ENV", { infer: true }) !== "development";
  }

  @Public()
  @SkipThrottle()
  @Post("auth/otp/request")
  @HttpCode(HttpStatus.ACCEPTED)
  async requestOtp(
    @Body(new ZodValidationPipe(OtpRequestInput)) body: OtpRequestInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<OtpRequestResponse> {
    const ip = req.ip ?? "127.0.0.1";
    return this.authService.requestOtp(body, ip, res);
  }

  @Public()
  @SkipThrottle()
  @Post("auth/otp/verify")
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body(new ZodValidationPipe(OtpVerifyInput)) body: OtpVerifyInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthVerifyResponse> {
    const ip = req.ip ?? "127.0.0.1";
    const userAgent = req.headers["user-agent"];
    const result = await this.authService.verifyOtp(body, ip, userAgent, res);

    setRefreshTokenCookie(res, result.refreshToken, this.secureCookie);

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  /** D-043: Sign in with Google (ID token from Google Identity Services). 10 per IP per minute. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("auth/google")
  @HttpCode(HttpStatus.OK)
  async google(
    @Body(new ZodValidationPipe(GoogleSignInInput)) body: GoogleSignInInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthVerifyResponse> {
    const result = await this.authService.googleSignIn(
      body.credential,
      req.ip ?? "127.0.0.1",
      req.headers["user-agent"],
    );
    setRefreshTokenCookie(res, result.refreshToken, this.secureCookie);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Public()
  @SkipThrottle()
  @Post("auth/refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthRefreshResponse> {
    const rawToken = getRefreshTokenFromReq(req);
    if (!rawToken) {
      // A marker without a refresh token is stale, drop it so the web guard stops trusting it.
      clearRefreshTokenCookie(res, this.secureCookie);
      throw new AppError("UNAUTHENTICATED", "No refresh token provided");
    }

    const ip = req.ip;
    const userAgent = req.headers["user-agent"];
    let result: Awaited<ReturnType<AuthService["refresh"]>>;
    try {
      result = await this.authService.refresh(rawToken, ip, userAgent, res);
    } catch (err) {
      // A dead token must not stay in the browser (the web route guard only checks it exists).
      if (err instanceof AppError && err.code === "UNAUTHENTICATED") {
        clearRefreshTokenCookie(res, this.secureCookie);
      }
      throw err;
    }

    setRefreshTokenCookie(res, result.newRefreshToken, this.secureCookie);

    return {
      accessToken: result.accessToken,
    };
  }

  @Public()
  @Post("auth/logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<void> {
    const rawToken = getRefreshTokenFromReq(req);
    const ip = req.ip;
    const userAgent = req.headers["user-agent"];

    await this.authService.logout(rawToken, user, ip, userAgent);
    clearRefreshTokenCookie(res, this.secureCookie);
  }

  @Get("me")
  async getMe(@CurrentUser() user: AuthenticatedUser): Promise<MeDto> {
    if (!user) {
      throw new AppError("UNAUTHENTICATED", "Authentication required");
    }
    return this.authService.getMe(user.id);
  }

  @Patch("me")
  async updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(UpdateMeInput)) body: UpdateMeInput,
  ): Promise<MeDto> {
    if (!user) {
      throw new AppError("UNAUTHENTICATED", "Authentication required");
    }
    return this.authService.updateMe(user.id, body);
  }

  /** D-048: add or change the email or phone. Same per target and per IP limits as login codes. */
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @Post("me/contact/otp/request")
  @HttpCode(HttpStatus.ACCEPTED)
  async requestContactOtp(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(ContactOtpRequestInput)) body: ContactOtpRequestInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ContactOtpRequestResponse> {
    return this.authService.requestContactOtp(user.id, body, req.ip ?? "unknown", res);
  }

  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @Post("me/contact/otp/verify")
  @HttpCode(HttpStatus.OK)
  async verifyContactOtp(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(ContactOtpVerifyInput)) body: ContactOtpVerifyInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeDto> {
    return this.authService.verifyContactOtp(user.id, body, req.ip ?? "unknown", req.headers["user-agent"], res);
  }

  /** D-048: signed in devices. Under /auth because the refresh cookie (the current device) is scoped there. */
  @Get("auth/sessions")
  sessions(@CurrentUser() user: AuthenticatedUser, @Req() req: Request): Promise<SessionDto[]> {
    return this.authService.sessions(user.id, getRefreshTokenFromReq(req));
  }

  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @Post("auth/sessions/revoke-others")
  @HttpCode(HttpStatus.OK)
  async revokeOtherSessions(@CurrentUser() user: AuthenticatedUser, @Req() req: Request): Promise<{ revoked: number }> {
    const revoked = await this.authService.revokeOtherSessions(user, getRefreshTokenFromReq(req), req.ip, req.headers["user-agent"]);
    return { revoked };
  }
}
