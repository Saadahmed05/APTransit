import { PublicId, SaveRouteInput, type SavedRouteDto } from "@aptransit/shared";
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { AuthenticatedUser } from "../../common/auth/auth.types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { MeService } from "./me.service";

/** D-048: GET, POST /me/saved-routes and DELETE /me/saved-routes/:id (the owner only). */
@Controller("me/saved-routes")
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<SavedRouteDto[]> {
    return this.me.savedRoutes(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  save(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(SaveRouteInput)) body: SaveRouteInput): Promise<SavedRouteDto> {
    return this.me.saveRoute(user.id, body);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthenticatedUser, @Param("id", new ZodValidationPipe(PublicId)) id: string): Promise<void> {
    return this.me.deleteRoute(user.id, id);
  }
}
