import type { NotificationType } from "./enums";
import en from "./messages/en.json";
import te from "./messages/te.json";

// docs/10 exception: notification and email strings live here so the web inbox and the API
// emails use the same words. The web merges these files into next-intl; the API formats them here.

export type MessageLocale = "en" | "te";
export const SHARED_MESSAGES = { en, te } as const;

/** {name} placeholders only (these strings have no plurals). Unknown placeholders stay as written. */
export function formatTemplate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in params ? String(params[key]) : whole));
}

export function messageLocale(value: string | null | undefined): MessageLocale {
  return value === "te" ? "te" : "en";
}

/** Title and body of a notification in a locale, from notifications.<TYPE>. */
export function notificationText(locale: MessageLocale, type: NotificationType, params: Record<string, string | number>) {
  const entry = SHARED_MESSAGES[locale].notifications[type];
  return { title: formatTemplate(entry.title, params), body: formatTemplate(entry.body, params) };
}

/** A string from email.* by dotted key ("layout.open"). */
export function emailText(locale: MessageLocale, key: string, params: Record<string, string | number> = {}): string {
  let node: unknown = SHARED_MESSAGES[locale].email;
  for (const part of key.split(".")) node = (node as Record<string, unknown> | undefined)?.[part];
  if (typeof node !== "string") throw new Error(`Missing email message ${locale}.email.${key}`);
  return formatTemplate(node, params);
}
