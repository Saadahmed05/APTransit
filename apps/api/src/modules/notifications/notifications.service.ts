import type {
  NotificationDto,
  NotificationsPage,
  NotificationType,
  StoredNotificationParams,
} from "@aptransit/shared";
import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, Optional } from "@nestjs/common";
import type { Queue } from "bullmq";
import { AppError } from "../../common/errors/app-error";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { createHash } from "node:crypto";
import { QUEUES } from "../queue/queue.constants";

export const SEND_EMAIL_JOB = "send-email";
/** Queue calls never hold up the request that caused the notification. */
const QUEUE_ADD_TIMEOUT_MS = 3_000;

interface NotificationRow {
  id: string;
  userId: string;
  type: NotificationType;
  params: unknown;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export function toNotificationDto(row: NotificationRow): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    params: (row.params ?? {}) as StoredNotificationParams,
    link: row.link,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function withTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("queue call timed out")), QUEUE_ADD_TIMEOUT_MS);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** In app notifications (docs/05 notifications) plus the email job for users with an email. */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @InjectQueue(QUEUES.NOTIFICATIONS) private readonly queue?: Queue,
    @Optional() private readonly events?: DomainEventsService,
  ) {}

  /** Writes the row, then queues the email. Copy is never stored: the type and params are. */
  async notify(
    userId: string,
    type: NotificationType,
    params: StoredNotificationParams,
    link: string | null,
    dedupeKey?: string,
  ): Promise<NotificationDto> {
    const id = dedupeKey
      ? createHash("sha256").update(`${userId}:${dedupeKey}`).digest("hex").slice(0, 24)
      : undefined;
    if (id) {
      const existing = await this.prisma.notification.findUnique({ where: { id } });
      if (existing) return toNotificationDto(existing);
    }
    let row: NotificationRow;
    try {
      row = await this.prisma.notification.create({
        data: {
          ...(id ? { id } : {}),
          userId,
          type,
          params: params as Prisma.InputJsonValue,
          link,
        },
      });
    } catch (error) {
      if (!id || (error as { code?: string }).code !== "P2002") throw error;
      const existing = await this.prisma.notification.findUniqueOrThrow({ where: { id } });
      return toNotificationDto(existing);
    }
    this.events?.publish("notification.created", { userId, notification: toNotificationDto(row) });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (user?.email && this.queue) {
      try {
        // A job id per notification: a retried notify can never send two emails
        await withTimeout(
          this.queue.add(
            SEND_EMAIL_JOB,
            { notificationId: row.id },
            {
              jobId: `email-${row.id}`,
              attempts: 3,
              backoff: { type: "exponential", delay: 30_000 },
              removeOnComplete: true,
              removeOnFail: 100,
            },
          ),
        );
      } catch (err) {
        this.logger.warn(
          `Email job for notification ${row.id} not queued: ${(err as Error).message}`,
        );
      }
    }
    return toNotificationDto(row);
  }

  /** Newest first, cursor = the last id of the previous page (docs/06 Pagination). */
  async list(
    userId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<NotificationsPage> {
    let before: Prisma.NotificationWhereInput = {};
    if (cursor) {
      const anchor = await this.prisma.notification.findFirst({
        where: { id: cursor, userId },
        select: { id: true, createdAt: true },
      });
      if (!anchor) throw new AppError("VALIDATION_FAILED", "Unknown cursor");
      before = {
        OR: [
          { createdAt: { lt: anchor.createdAt } },
          { createdAt: anchor.createdAt, id: { lt: anchor.id } },
        ],
      };
    }
    const rows = (await this.prisma.notification.findMany({
      where: { userId, ...before },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    })) as NotificationRow[];
    const page = rows.slice(0, limit);
    return {
      items: page.map(toNotificationDto),
      nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  /** Owner only: another user's id is NOT_FOUND. Reading twice keeps the first readAt. */
  async markRead(userId: string, id: string, now = new Date()): Promise<void> {
    const row = await this.prisma.notification.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!row) throw new AppError("NOT_FOUND", "Notification not found");
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: now },
    });
  }

  async markAllRead(userId: string, now = new Date()): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: now },
    });
  }
}
