import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "../cn";

export interface StepperProps extends React.HTMLAttributes<HTMLElement> {
  /** Translated step names, in order (Seat, Details, Pay). */
  steps: string[];
  /** Zero based index of the current step. */
  current: number;
  /** Accessible name of the step list, for example "Booking steps". */
  label: string;
  /** Translated "Step 2 of 3: Details", announced politely when the step changes. */
  announcement: string;
  /** Translated "Completed", read after a finished step's name. */
  completedLabel: string;
}

/** docs/09 Stepper. The current step has aria-current="step" and is announced to screen readers. */
export const Stepper = React.forwardRef<HTMLElement, StepperProps>(
  ({ steps, current, label, announcement, completedLabel, className, ...props }, ref) => (
    <nav ref={ref} aria-label={label} className={cn("w-full", className)} {...props}>
      <ol className="flex items-center gap-2">
        {steps.map((step, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <li key={step} className="flex min-w-0 flex-1 items-center gap-2" aria-current={active ? "step" : undefined}>
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full border text-small font-semibold font-tabular",
                  done && "border-primary bg-primary text-on-primary",
                  active && "border-primary bg-primary-soft text-primary",
                  !done && !active && "border-strong text-muted",
                )}
                aria-hidden="true"
              >
                {done ? <Check className="size-4" /> : index + 1}
              </span>
              <span className={cn("min-w-0 break-words text-small", active ? "font-semibold text-fg" : "text-muted")}>
                {step}
                {done && <span className="sr-only">, {completedLabel}</span>}
              </span>
              {index < steps.length - 1 && <span className="hidden h-px flex-1 bg-default sm:block" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </nav>
  ),
);
Stepper.displayName = "Stepper";
