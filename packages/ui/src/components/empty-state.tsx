import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../cn";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  headingLevel?: "h1" | "h2" | "h3";
}

export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ icon: Icon, title, hint, action, headingLevel = "h3", className, ...props }, ref) => {
    const HeadingTag = headingLevel;
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col items-center justify-center p-8 text-center",
          className
        )}
        {...props}
      >
        <div className="flex size-16 items-center justify-center rounded-full bg-surface text-muted mb-4">
          <Icon className="size-10" strokeWidth={1.75} aria-hidden="true" />
        </div>
        <HeadingTag className="text-h3 font-semibold text-fg">{title}</HeadingTag>
        {hint && (
          <p className="mt-1.5 max-w-xs text-small text-subtle">{hint}</p>
        )}
        {action && <div className="mt-5">{action}</div>}
      </div>
    );
  }
);

EmptyState.displayName = "EmptyState";
