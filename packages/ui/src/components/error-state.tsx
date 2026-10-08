"use client";

import * as React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { cn } from "../cn";
import { Button } from "./button";

export interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  message: string;
  retryLabel: string;
  onRetry?: () => void;
  requestId?: string;
  headingLevel?: "h1" | "h2" | "h3";
}

export const ErrorState = React.forwardRef<HTMLDivElement, ErrorStateProps>(
  (
    {
      title,
      message,
      retryLabel,
      onRetry,
      requestId,
      headingLevel = "h3",
      className,
      ...props
    },
    ref
  ) => {
    const HeadingTag = headingLevel;
    return (
      <div
        ref={ref}
        role="alert"
        className={cn(
          "flex flex-col items-center justify-center p-8 text-center",
          className
        )}
        {...props}
      >
        <div className="flex size-16 items-center justify-center rounded-full bg-status-danger-soft text-status-danger mb-4">
          <AlertTriangle className="size-10" strokeWidth={1.75} aria-hidden="true" />
        </div>
        {title && <HeadingTag className="text-h3 font-semibold text-fg">{title}</HeadingTag>}
        <p className="mt-1.5 max-w-md text-body text-muted">{message}</p>

        {requestId && (
          <p className="mt-2 font-mono text-caption text-subtle">
            Request ID: {requestId}
          </p>
        )}

        {onRetry && (
          <div className="mt-5">
            <Button
              variant="secondary"
              size="md"
              onClick={onRetry}
              leftIcon={<RotateCcw className="h-4 w-4" />}
            >
              {retryLabel}
            </Button>
          </div>
        )}
      </div>
    );
  }
);

ErrorState.displayName = "ErrorState";
