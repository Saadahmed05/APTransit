import * as React from "react";
import { cn } from "../cn";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  shape?: "line" | "block" | "card" | "circle";
}

export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, shape = "line", ...props }, ref) => {
    const basePulse =
      "bg-surface-sunken animate-pulse motion-reduce:animate-none";

    if (shape === "circle") {
      return (
        <div
          ref={ref}
          className={cn("h-10 w-10 rounded-full", basePulse, className)}
          {...props}
        />
      );
    }

    if (shape === "block") {
      return (
        <div
          ref={ref}
          className={cn("h-24 w-full rounded-md", basePulse, className)}
          {...props}
        />
      );
    }

    if (shape === "card") {
      return (
        <div
          ref={ref}
          className={cn(
            "w-full rounded-lg border border-default bg-surface-raised p-4 flex flex-col gap-3",
            className
          )}
          {...props}
        >
          <div className={cn("h-5 w-2/3 rounded-sm", basePulse)} />
          <div className={cn("h-4 w-full rounded-sm", basePulse)} />
          <div className={cn("h-4 w-4/5 rounded-sm", basePulse)} />
        </div>
      );
    }

    // Default: line
    return (
      <div
        ref={ref}
        className={cn("h-4 w-full rounded-sm", basePulse, className)}
        {...props}
      />
    );
  }
);

Skeleton.displayName = "Skeleton";
