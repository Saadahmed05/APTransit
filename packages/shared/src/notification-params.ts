import { formatDate, formatTime } from "./format";
import type { MessageLocale } from "./messages";

export type StoredNotificationParams = Record<string, string | number | null>;

/**
 * Stored params are language neutral: names come as <key>En and <key>Te, times as ISO strings.
 * This picks the locale's names and formats times, for the web inbox and the API emails alike.
 * departureAt gives {date} and {time}; validUntil gives {when}.
 */
export function notificationParams(stored: StoredNotificationParams, locale: MessageLocale): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  const suffix = locale === "te" ? "Te" : "En";
  for (const [key, value] of Object.entries(stored)) {
    if (value === null) continue;
    if (/(En|Te)$/.test(key)) {
      if (key.endsWith(suffix)) out[key.slice(0, -2)] = value;
      continue;
    }
    out[key] = value;
  }
  if (typeof stored.departureAt === "string") {
    out.date = formatDate(stored.departureAt, locale);
    out.time = formatTime(stored.departureAt, locale);
  }
  if (typeof stored.validUntil === "string") {
    out.when = `${formatDate(stored.validUntil, locale)}, ${formatTime(stored.validUntil, locale)}`;
  }
  return out;
}
