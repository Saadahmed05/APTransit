import {
  emailText,
  type MessageLocale,
  type NotificationType,
  notificationParams,
  notificationText,
  type StoredNotificationParams,
} from "@aptransit/shared";

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/**
 * A notification email in the user's language (docs/10: every word from packages/shared messages).
 * Plain layout, one link button, a text version too. The colours are email client fallbacks, not UI
 * tokens: emails cannot load our CSS.
 */
export function renderNotificationEmail(
  locale: MessageLocale,
  type: NotificationType,
  stored: StoredNotificationParams,
  link: string | null,
  webOrigin: string,
): RenderedEmail {
  const { title, body } = notificationText(locale, type, notificationParams(stored, locale));
  const url = link ? new URL(link, webOrigin).toString() : webOrigin;
  const open = emailText(locale, "layout.open");
  const footer = emailText(locale, "layout.footer");

  const text = `${title}\n\n${body}\n\n${open}: ${url}\n\n${footer}`;
  const html = [
    "<!doctype html>",
    `<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title></head>`,
    '<body style="margin:0;padding:24px;font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#0e1621;background:#ffffff">',
    `<h1 style="font-size:22px;margin:0 0 12px">${escapeHtml(title)}</h1>`,
    `<p style="margin:0 0 20px">${escapeHtml(body)}</p>`,
    `<p style="margin:0 0 24px"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:10px">${escapeHtml(open)}</a></p>`,
    `<p style="margin:0;font-size:14px;color:#475467">${escapeHtml(footer)}</p>`,
    "</body></html>",
  ].join("");
  return { subject: title, text, html };
}
