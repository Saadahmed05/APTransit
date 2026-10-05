// docs/07 section 8 and docs/09 Countdown: "5 days 08 hours 21 minutes", and under 24 hours
// "08 hours 21 minutes 09 seconds" updating every second. Pure, so the web and tests agree.

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export interface CountdownParts {
  /** Milliseconds left, never negative. */
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** Under 24 hours left: show seconds and tick every second. */
  showSeconds: boolean;
  done: boolean;
}

export function countdownParts(untilMs: number, nowMs: number): CountdownParts {
  const totalMs = Math.max(0, untilMs - nowMs);
  return {
    totalMs,
    days: Math.floor(totalMs / DAY),
    hours: Math.floor((totalMs % DAY) / HOUR),
    minutes: Math.floor((totalMs % HOUR) / MINUTE),
    seconds: Math.floor((totalMs % MINUTE) / SECOND),
    showSeconds: totalMs < DAY,
    done: totalMs === 0,
  };
}

/** How long until the visible text changes: next second under a day, else next minute. */
export function countdownTickMs(parts: CountdownParts): number {
  if (parts.done) return 0;
  return parts.showSeconds ? (parts.totalMs % SECOND) || SECOND : (parts.totalMs % MINUTE) || MINUTE;
}
