import { z } from "zod";
import { NotificationType } from "../enums";

/** docs/06 Notifications. `params` are stored values; notificationParams turns them into message params. */
export const NotificationDto = z.object({
  id: z.string(),
  type: NotificationType,
  params: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
  link: z.string().nullable(),
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type NotificationDto = z.infer<typeof NotificationDto>;

export const NotificationsQuery = z.object({
  cursor: z.string().regex(/^[a-z0-9]{8,40}$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type NotificationsQuery = z.infer<typeof NotificationsQuery>;

export const NotificationsPage = z.object({
  items: z.array(NotificationDto),
  nextCursor: z.string().nullable(),
});
export type NotificationsPage = z.infer<typeof NotificationsPage>;

export const UnreadCountDto = z.object({ count: z.number().int().nonnegative() });
export type UnreadCountDto = z.infer<typeof UnreadCountDto>;
