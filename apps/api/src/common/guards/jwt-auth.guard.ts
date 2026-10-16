import { can, type Permission } from "@aptransit/shared";
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import * as jose from "jose";
import type { Env } from "../../config/env";
import { RedisService } from "../../redis/redis.service";
import { sessionEnded } from "../auth/session-end";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PERMISSION_KEY } from "../decorators/can.decorator";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { AppError } from "../errors/app-error";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly jwtSecret: Uint8Array;

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService<Env, true>,
    @Optional() private readonly redis?: RedisService,
  ) {
    this.jwtSecret = new TextEncoder().encode(this.config.get("JWT_SECRET", { infer: true }));
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

    if (!token) {
      if (isPublic) {
        return true;
      }
      throw new AppError("UNAUTHENTICATED", "Authentication required");
    }

    let payload: jose.JWTPayload & { roles?: AuthenticatedUser["roles"]; sid?: string };
    try {
      const verified = await jose.jwtVerify(token, this.jwtSecret);
      payload = verified.payload as typeof payload;
    } catch {
      if (isPublic) {
        return true;
      }
      throw new AppError("UNAUTHENTICATED", "Invalid or expired token");
    }

    if (!payload.sub) {
      if (isPublic) return true;
      throw new AppError("UNAUTHENTICATED", "Invalid token payload");
    }

    // One device per citizen: a sign in on another device ended this session
    if (await sessionEnded(this.redis?.client, payload.sid)) {
      if (isPublic) return true;
      throw new AppError("SESSION_REPLACED", "You signed in on another device");
    }

    const user: AuthenticatedUser = {
      id: payload.sub,
      roles: payload.roles ?? [],
    };
    request.user = user;

    // Check permissions if required
    const requiredPermission = this.reflector.getAllAndOverride<Permission>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (requiredPermission) {
      const roles = user.roles.map((r) => r.role);
      const isAllowed = can(roles, requiredPermission);
      if (!isAllowed) {
        throw new AppError("FORBIDDEN", "Forbidden: insufficient permission");
      }
    }

    return true;
  }
}
