import { NotificationsPage, NotificationsQuery, PublicId, type UnreadCountDto } from "@aptransit/shared";
import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from "@nestjs/common";
import type { AuthenticatedUser } from "../../common/auth/auth.types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { NotificationsService } from "./notifications.service";

/** docs/06 Notifications. Any logged in user, own rows only. */
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(NotificationsQuery)) query: NotificationsQuery,
  ): Promise<NotificationsPage> {
    return this.notifications.list(user.id, query.cursor, query.limit);
  }

  @Get("unread-count")
  async unreadCount(@CurrentUser() user: AuthenticatedUser): Promise<UnreadCountDto> {
    return { count: await this.notifications.unreadCount(user.id) };
  }

  @Post("read-all")
  @HttpCode(HttpStatus.NO_CONTENT)
  async readAll(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.notifications.markAllRead(user.id);
  }

  @Post(":id/read")
  @HttpCode(HttpStatus.NO_CONTENT)
  async read(@CurrentUser() user: AuthenticatedUser, @Param("id", new ZodValidationPipe(PublicId)) id: string): Promise<void> {
    await this.notifications.markRead(user.id, id);
  }
}
