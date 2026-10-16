import { localTimeToUtc, type ServiceType } from "@aptransit/shared";

/**
 * Short service codes for trip codes. Two services can leave a route at the same minute (D-048:
 * every class every hour), so the service is part of the code.
 */
export const SERVICE_CODE: Record<ServiceType, string> = {
  PALLEVELUGU: "PLV",
  ULTRA_PALLEVELUGU: "UPV",
  CITY_ORDINARY: "CTO",
  METRO_EXPRESS: "MEX",
  EXPRESS: "EXP",
  ULTRA_DELUXE: "UDX",
  SUPER_LUXURY: "SLX",
  INDRA_AC: "IND",
  AMARAVATI_AC: "AMR",
  GARUDA_AC: "GRD",
};

export interface TimetableInput {
  id: string;
  routeId: string;
  routeCode?: string;
  busTypeId: string;
  serviceType: ServiceType;
  departureLocal: string; // HH:mm in IST
  daysMask: number; // Mon bit 0 to Sun bit 6 (127 = all days)
  validFrom: Date;
  validTo?: Date | null;
  isActive: boolean;
  durationMinutes: number; // Minutes from origin to final destination stop
}

export interface GeneratedTripRow {
  code: string;
  timetableId: string;
  routeId: string;
  busTypeId: string;
  serviceDate: Date; // UTC date corresponding to service day
  serviceDateStr: string; // YYYY-MM-DD in IST
  scheduledDepartureAt: Date;
  scheduledArrivalAt: Date;
  status: "SCHEDULED";
  delayMinutes: number;
  hasOpenIncident: boolean;
}

/**
 * Checks if a given service date (in IST) matches the daysMask.
 * Mon bit 0, Tue bit 1, Wed bit 2, Thu bit 3, Fri bit 4, Sat bit 5, Sun bit 6.
 */
export function isDayMaskActive(daysMask: number, year: number, month: number, day: number): boolean {
  // Construct date at midday UTC to avoid local timezone issues when determining day of week
  const utcMidday = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const dayOfWeek = utcMidday.getUTCDay(); // 0 is Sunday, 1 is Monday... 6 is Saturday
  const bitIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  return (daysMask & (1 << bitIndex)) !== 0;
}

/** A YYYY-MM-DD date plus `days` (calendar arithmetic, no time zone involved). */
export function addDateDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d! + days));
  return formatDateStr(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function formatDateStr(year: number, month: number, day: number): string {
  const mm = month < 10 ? `0${month}` : `${month}`;
  const dd = day < 10 ? `0${day}` : `${day}`;
  return `${year}-${mm}-${dd}`;
}

/**
 * Generates trips for a set of timetables over a date range.
 * Both startDateStr and endDateStr are inclusive in YYYY-MM-DD format (IST).
 */
export function generateTripsForTimetables(
  timetables: readonly TimetableInput[],
  startDateStr: string,
  endDateStr: string,
): GeneratedTripRow[] {
  const [startYear, startMonth, startDay] = startDateStr.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDateStr.split("-").map(Number);

  if (!startYear || !startMonth || !startDay || !endYear || !endMonth || !endDay) {
    throw new Error("Invalid start or end date format, expected YYYY-MM-DD");
  }

  const startDate = new Date(Date.UTC(startYear, startMonth - 1, startDay));
  const endDate = new Date(Date.UTC(endYear, endMonth - 1, endDay));

  if (startDate.getTime() > endDate.getTime()) {
    return [];
  }

  const trips: GeneratedTripRow[] = [];
  const currentDate = new Date(startDate.getTime());

  while (currentDate.getTime() <= endDate.getTime()) {
    const year = currentDate.getUTCFullYear();
    const month = currentDate.getUTCMonth() + 1;
    const day = currentDate.getUTCDate();
    const dateStr = formatDateStr(year, month, day);

    // Midnight UTC representation of service date
    const serviceDateUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));

    for (const timetable of timetables) {
      if (!timetable.isActive) {
        continue;
      }

      // Check validity window
      if (timetable.validFrom && serviceDateUtc.getTime() < new Date(timetable.validFrom).setUTCHours(0, 0, 0, 0)) {
        continue;
      }
      if (timetable.validTo && serviceDateUtc.getTime() > new Date(timetable.validTo).setUTCHours(23, 59, 59, 999)) {
        continue;
      }

      // Check day mask
      if (!isDayMaskActive(timetable.daysMask, year, month, day)) {
        continue;
      }

      const scheduledDepartureAt = localTimeToUtc(dateStr, timetable.departureLocal);
      const scheduledArrivalAt = new Date(
        scheduledDepartureAt.getTime() + timetable.durationMinutes * 60 * 1000,
      );

      // Deterministic unique trip code
      const timeClean = timetable.departureLocal.replace(":", "");
      const dateClean = dateStr.replace(/-/g, "");
      const routePrefix = timetable.routeCode || timetable.routeId.slice(0, 8);
      const code = `TRP-${routePrefix}-${dateClean}-${timeClean}-${SERVICE_CODE[timetable.serviceType]}`;

      trips.push({
        code,
        timetableId: timetable.id,
        routeId: timetable.routeId,
        busTypeId: timetable.busTypeId,
        serviceDate: serviceDateUtc,
        serviceDateStr: dateStr,
        scheduledDepartureAt,
        scheduledArrivalAt,
        status: "SCHEDULED",
        delayMinutes: 0,
        hasOpenIncident: false,
      });
    }

    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
  }

  return trips;
}
