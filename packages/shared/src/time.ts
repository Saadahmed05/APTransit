/**
 * Time and IST (Asia/Kolkata) date helpers.
 * IST is fixed at UTC+05:30 with no daylight saving time transitions.
 * Pure JS using Intl and standard Date methods, safe for browser and Node.
 */

/**
 * The one time zone of the platform (D-034). Every state row must use it until per state zones
 * exist (every Indian state is IST). Never write the zone name as a literal anywhere else.
 */
export const PLATFORM_TIME_ZONE = "Asia/Kolkata";

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

export interface IstParts {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
  dateStr: string; // YYYY-MM-DD
  timeStr: string; // HH:mm
}

function padZero(num: number): string {
  return num < 10 ? `0${num}` : `${num}`;
}

/**
 * Converts a service date (YYYY-MM-DD) and local IST time (HH:mm) into a UTC Date.
 */
export function localTimeToUtc(serviceDateStr: string, timeStr: string): Date {
  // Validate format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDateStr)) {
    throw new Error(`Invalid serviceDate format: ${serviceDateStr}, expected YYYY-MM-DD`);
  }
  if (!/^\d{2}:\d{2}$/.test(timeStr)) {
    throw new Error(`Invalid time format: ${timeStr}, expected HH:mm`);
  }

  const isoWithOffset = `${serviceDateStr}T${timeStr}:00+05:30`;
  const date = new Date(isoWithOffset);
  if (isNaN(date.getTime())) {
    throw new Error(`Failed to parse local date/time: ${isoWithOffset}`);
  }
  return date;
}

/**
 * Converts a UTC Date into its IST (Asia/Kolkata) components.
 */
export function utcToIstParts(utcDate: Date): IstParts {
  const istMillis = utcDate.getTime() + IST_OFFSET_MS;
  const istDate = new Date(istMillis);

  const year = istDate.getUTCFullYear();
  const month = istDate.getUTCMonth() + 1;
  const day = istDate.getUTCDate();
  const hours = istDate.getUTCHours();
  const minutes = istDate.getUTCMinutes();
  const seconds = istDate.getUTCSeconds();

  const dateStr = `${year}-${padZero(month)}-${padZero(day)}`;
  const timeStr = `${padZero(hours)}:${padZero(minutes)}`;

  return {
    year,
    month,
    day,
    hours,
    minutes,
    seconds,
    dateStr,
    timeStr,
  };
}

/**
 * Formats a UTC Date to "HH:mm" in IST.
 */
export function formatIstTime(utcDate: Date): string {
  return utcToIstParts(utcDate).timeStr;
}

/**
 * Formats a UTC Date to "YYYY-MM-DD" in IST.
 */
export function formatIstDate(utcDate: Date): string {
  return utcToIstParts(utcDate).dateStr;
}

/**
 * Computes scheduled departure and arrival UTC dates given a service date,
 * scheduled departure clock time (HH:mm in IST), and duration in minutes.
 * Handles night trips that cross midnight.
 */
export function computeTripSchedule(
  serviceDateStr: string,
  departureTimeStr: string,
  durationMinutes: number,
): {
  scheduledDepartureAt: Date;
  scheduledArrivalAt: Date;
  arrivalLocal: string;
  arrivalDateStr: string;
  crossesMidnight: boolean;
} {
  const scheduledDepartureAt = localTimeToUtc(serviceDateStr, departureTimeStr);
  const scheduledArrivalAt = new Date(scheduledDepartureAt.getTime() + durationMinutes * 60 * 1000);

  const depParts = utcToIstParts(scheduledDepartureAt);
  const arrParts = utcToIstParts(scheduledArrivalAt);

  return {
    scheduledDepartureAt,
    scheduledArrivalAt,
    arrivalLocal: arrParts.timeStr,
    arrivalDateStr: arrParts.dateStr,
    crossesMidnight: depParts.dateStr !== arrParts.dateStr,
  };
}
