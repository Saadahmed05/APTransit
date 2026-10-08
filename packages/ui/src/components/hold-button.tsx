"use client";

import * as React from "react";
import { cn } from "../cn";

export interface HoldButtonProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "onClick" | "children"
> {
  /** Resting label, already translated ("Hold for SOS"). */
  label: string;
  /** Label while the button is held ("Keep holding"). */
  holdingLabel: string;
  /** Read by screen readers ("Press and hold for 3 seconds to send an emergency alert"). */
  hint: string;
  /** Runs once when the 3 second hold completes. */
  onComplete: () => void;
}

/** Same value as --dur-hold in tokens.css. */
export const HOLD_MS = 3000;

/**
 * Press and hold for 3 seconds (SOS). A fill grows across the button while held; letting go early
 * cancels. Pointer: press and hold. Keyboard: hold Space or Enter. Completion runs once per hold.
 * The fill is a transform only, and a screen reader gets the hint through aria-describedby.
 */
export const HoldButton = React.forwardRef<HTMLButtonElement, HoldButtonProps>(
  ({ label, holdingLabel, hint, onComplete, disabled, className, ...props }, ref) => {
    const [holding, setHolding] = React.useState(false);
    const timer = React.useRef<number | null>(null);
    const completeRef = React.useRef(onComplete);
    const hintId = React.useId();

    React.useEffect(() => {
      completeRef.current = onComplete;
    }, [onComplete]);

    const cancel = React.useCallback(() => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
      setHolding(false);
    }, []);

    const start = React.useCallback(() => {
      if (disabled || timer.current !== null) return;
      setHolding(true);
      timer.current = window.setTimeout(() => {
        timer.current = null;
        setHolding(false);
        completeRef.current();
      }, HOLD_MS);
    }, [disabled]);

    React.useEffect(() => cancel, [cancel]);

    const isHoldKey = (key: string) => key === " " || key === "Enter";

    return (
      <>
        <button
          ref={ref}
          type="button"
          disabled={disabled}
          aria-describedby={hintId}
          className={cn(
            "relative flex h-16 w-full touch-none select-none items-center justify-center overflow-hidden rounded-md bg-status-danger-solid px-6 text-body-lg font-semibold text-on-solid",
            "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary focus-visible:ring-offset-2",
            "disabled:pointer-events-none disabled:opacity-40",
            className,
          )}
          onPointerDown={(event) => {
            // Only the primary press (or a touch) holds; right and middle clicks do not
            if (event.button > 0) return;
            start();
          }}
          onPointerUp={cancel}
          onPointerLeave={cancel}
          onPointerCancel={cancel}
          onContextMenu={(event) => event.preventDefault()}
          onKeyDown={(event) => {
            if (!isHoldKey(event.key)) return;
            event.preventDefault();
            if (!event.repeat) start();
          }}
          onKeyUp={(event) => {
            if (!isHoldKey(event.key)) return;
            event.preventDefault();
            cancel();
          }}
          onBlur={cancel}
          {...props}
        >
          <span
            aria-hidden="true"
            data-testid="hold-fill"
            className={cn(
              "absolute inset-0 origin-left bg-on-solid/25 ease-linear",
              holding ? "scale-x-100 duration-hold" : "scale-x-0 duration-fast",
            )}
          />
          <span className="relative">{holding ? holdingLabel : label}</span>
        </button>
        <span id={hintId} className="sr-only">
          {hint}
        </span>
        <span role="status" className="sr-only">
          {holding ? holdingLabel : ""}
        </span>
      </>
    );
  },
);
HoldButton.displayName = "HoldButton";
