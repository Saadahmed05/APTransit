import { messageLocale, type NotificationType, type StoredNotificationParams } from "@aptransit/shared";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env";
import { PrismaService } from "../../prisma/prisma.service";
import { EMAIL_PROVIDER, type EmailProvider } from "../auth/email.provider";
import { renderNotificationEmail } from "./email-template";

/** Worker side of a notification: render in the user's language, send, mark emailedAt. */
@Injectable()
export class NotificationEmailService {
  private readonly logger = new Logger(NotificationEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
  ) {}

  /** Idempotent: an already emailed notification is skipped, so a retried job never sends twice. */
  async send(notificationId: string, now = new Date()): Promise<"SENT" | "SKIPPED"> {
    const row = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      include: { user: { select: { email: true, preferredLocale: true, deletedAt: true } } },
    });
    if (!row || row.emailedAt || !row.user.email || row.user.deletedAt) return "SKIPPED";

    const mail = renderNotificationEmail(
      messageLocale(row.user.preferredLocale),
      row.type as NotificationType,
      (row.params ?? {}) as StoredNotificationParams,
      row.link,
      this.config.get("WEB_ORIGIN", { infer: true }),
    );
    await this.email.sendEmail(row.user.email, mail.subject, mail.text, mail.html);
    await this.prisma.notification.updateMany({ where: { id: row.id, emailedAt: null }, data: { emailedAt: now } });
    this.logger.log(`Notification ${row.id} (${row.type}) emailed`);
    return "SENT";
  }
}
