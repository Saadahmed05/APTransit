/**
 * Locale-aware string formatters for time, date, money, duration, and distance.
 * Always renders in the platform time zone (IST) with Indian number grouping.
 * Hard rule: No em dash or en dash anywhere.
 */

import { PLATFORM_TIME_ZONE } from "./time";

export function formatTime(input: Date | string | number, locale = "en"): string {
  const date = typeof input === "string" || typeof input === "number" ? new Date(input) : input;
  if (isNaN(date.getTime())) {
    return "";
  }
  const intlLocale = locale === "te" ? "te-IN" : "en-IN";
  return new Intl.DateTimeFormat(intlLocale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: PLATFORM_TIME_ZONE,
  }).format(date);
}

/** Live clock with seconds for the ticket screen: "06:30:09 AM", in IST. */
export function formatClock(input: Date | string | number, locale = "en"): string {
  const date = typeof input === "string" || typeof input === "number" ? new Date(input) : input;
  if (isNaN(date.getTime())) {
    return "";
  }
  const intlLocale = locale === "te" ? "te-IN" : "en-IN";
  return new Intl.DateTimeFormat(intlLocale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: PLATFORM_TIME_ZONE,
  }).format(date);
}

export function formatDate(input: Date | string | number, locale = "en"): string {
  const date = typeof input === "string" || typeof input === "number" ? new Date(input) : input;
  if (isNaN(date.getTime())) {
    return "";
  }
  const intlLocale = locale === "te" ? "te-IN" : "en-IN";
  return new Intl.DateTimeFormat(intlLocale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: PLATFORM_TIME_ZONE,
  }).format(date);
}

export function formatMoney(paise: number, locale = "en"): string {
  if (!Number.isFinite(paise)) return "₹0";
  const rupees = paise / 100;
  const intlLocale = locale === "te" ? "te-IN" : "en-IN";
  const hasDecimals = paise % 100 !== 0;
  return new Intl.NumberFormat(intlLocale, {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0,
  }).format(rupees);
}

export function formatDuration(totalMinutes: number, locale = "en"): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) {
    return locale === "te" ? "0 నిమి" : "0 min";
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);

  if (locale === "te") {
    if (hours > 0 && minutes > 0) return `${hours} గం ${minutes} నిమి`;
    if (hours > 0) return `${hours} గం`;
    return `${minutes} నిమి`;
  }

  if (hours > 0 && minutes > 0) return `${hours} h ${minutes} min`;
  if (hours > 0) return `${hours} h`;
  return `${minutes} min`;
}

export function formatDistance(km: number, locale = "en"): string {
  if (!Number.isFinite(km) || km < 0) {
    return locale === "te" ? "0 కి.మీ" : "0 km";
  }
  const wholeKm = Math.round(km);
  if (locale === "te") {
    return `${wholeKm} కి.మీ`;
  }
  return `${wholeKm} km`;
}
