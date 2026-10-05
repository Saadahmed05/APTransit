"use client";

import { type CountdownParts, countdownParts, countdownTickMs } from "@aptransit/shared";
import * as React from "react";
import { cn } from "../cn";

export interface CountdownProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  /** The end, as ISO string, epoch ms or Date. */
  until: string | number | Date;
  /** Visible text, e.g. "5 days 08 hours 21 minutes" (seconds under 24 hours). */
  format: (parts: CountdownParts) => string;
  /** Screen reader text without seconds; it only changes once a minute. */
  summary: (parts: CountdownParts) => string;
  /** Shown when the time is up. */
  doneLabel: string;
}

const toMs = (value: CountdownProps["until"]) => (value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value));

/**
 * docs/09 Countdown: days, hours, minutes, and seconds under 24 hours. One timer that fires on the
 * next visible change, cleared on unmount, paused while the tab is hidden and re synced when it is
 * shown again. The visible text is aria-live off; a visually hidden summary carries the meaning.
 */
export function Countdown({ until, format, summary, doneLabel, className, ...props }: CountdownProps) {
  const untilMs = toMs(until);
  const [now, setNow] = React.useState<number | null>(null);

  React.useEffect(() => {
    let timer: number | undefined;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      const parts = countdownParts(untilMs, current);
      if (parts.done || document.visibilityState === "hidden") return;
      timer = window.setTimeout(tick, countdownTickMs(parts));
    };
    const onVisibility = () => {
      window.clearTimeout(timer);
      if (document.visibilityState === "visible") tick();
    };
    timer = window.setTimeout(tick, 0);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [untilMs]);

  if (now === null) {
    return <span className={cn("inline-block min-h-6 tabular-nums", className)} {...props} />;
  }
  const parts = countdownParts(untilMs, now);
  return (
    <span className={cn("tabular-nums", className)} {...props}>
      <span aria-hidden="true">{parts.done ? doneLabel : format(parts)}</span>
      <span className="sr-only">{parts.done ? doneLabel : summary(parts)}</span>
    </span>
  );
}
