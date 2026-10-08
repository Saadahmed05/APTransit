"use client";

import * as React from "react";
import { cn } from "../cn";

export interface ResultSplashProps extends React.HTMLAttributes<HTMLDivElement> {
  /** success = VALID. danger = any rejection. */
  tone: "success" | "danger";
  /** Big label, already translated ("Valid", "Already used"). */
  label: string;
  /** One line of reason or instruction, already translated. */
  reason?: string;
  /** Passenger and seat line, or a "2 of 4 boarded" counter. */
  detail?: React.ReactNode;
  /** The 96 px icon from packages/shared status (never colour alone). */
  icon: React.ReactNode;
  /** Called after the auto reset time (3 s). Omit to keep the result on screen. */
  onReset?: () => void;
}

/** Same value as --dur-hold in tokens.css. */
export const RESULT_RESET_MS = 3000;

/**
 * Full screen scan result (docs/09, Result splash): solid tone, icon, big label, reason.
 * role="status" for VALID and role="alert" for a rejection, so a screen reader hears it at once.
 * A bar drains over 3 seconds, then onReset runs and the scanner is ready for the next ticket.
 */
export const ResultSplash = React.forwardRef<HTMLDivElement, ResultSplashProps>(
  ({ tone, label, reason, detail, icon, onReset, className, ...props }, ref) => {
    const onResetRef = React.useRef(onReset);
    React.useEffect(() => {
      onResetRef.current = onReset;
    }, [onReset]);

    const active = Boolean(onReset);
    React.useEffect(() => {
      if (!active) return;
      const id = window.setTimeout(() => onResetRef.current?.(), RESULT_RESET_MS);
      return () => window.clearTimeout(id);
    }, [active, label, reason]);

    return (
      <div
        ref={ref}
        role={tone === "success" ? "status" : "alert"}
        className={cn(
          "fixed inset-0 z-overlay flex animate-fade-in flex-col items-center justify-center gap-6 p-8 text-center text-on-solid",
          tone === "success" ? "bg-status-success-solid" : "bg-status-danger-solid",
          className,
        )}
        {...props}
      >
        <span
          className="inline-flex size-24 items-center justify-center [&>svg]:size-24"
          aria-hidden="true"
        >
          {icon}
        </span>
        <p className="text-display-lg">{label}</p>
        {reason ? <p className="max-w-md text-body-lg">{reason}</p> : null}
        {detail ? <div className="text-body-lg font-medium tabular-nums">{detail}</div> : null}
        {active ? (
          <span
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-1 animate-drain bg-on-solid"
          />
        ) : null}
      </div>
    );
  },
);
ResultSplash.displayName = "ResultSplash";
