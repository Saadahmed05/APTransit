import * as React from "react";
import type { DisplayStatus } from "@aptransit/shared";
import { ArrowRight, Sparkles } from "lucide-react";
import { cn } from "../cn";
import { StatusBadge } from "./status-badge";

export interface TripCardProps extends React.HTMLAttributes<HTMLDivElement> {
  departureTime: string;
  arrivalTime: string;
  duration: string;
  serviceTypeName: string;
  destinationName: string;
  seatsLeft: number;
  fareFormatted: string;
  status?: DisplayStatus;
  statusLabel?: string;
  freeTravelEligible?: boolean;
  freeTravelLabel?: string;
  approxLabel?: string;
  seatsLeftText: string;
  fullLabel?: string;
  href?: string;
  routeCode?: string;
}

export const TripCard = React.forwardRef<HTMLDivElement, TripCardProps>(
  (
    {
      departureTime,
      arrivalTime,
      duration,
      serviceTypeName,
      destinationName,
      seatsLeft,
      fareFormatted,
      status = "UPCOMING",
      statusLabel,
      freeTravelEligible = false,
      freeTravelLabel = "Free travel eligible",
      approxLabel = "approx.",
      seatsLeftText,
      fullLabel = "Full",
      href,
      routeCode,
      className,
      ...props
    },
    ref
  ) => {
    const isFull = seatsLeft <= 0;
    const isLowSeats = seatsLeft > 0 && seatsLeft <= 5;
    const isNonUpcoming = status !== "UPCOMING";

    const displaySeatsText = isFull ? fullLabel : seatsLeftText;

    const accessibleName = `${departureTime} ${serviceTypeName} to ${destinationName}, arrives ${arrivalTime}, ${displaySeatsText}, ${fareFormatted}`;

    const content = (
      <div
        className={cn(
          "rounded-lg border p-4 transition-colors relative",
          isFull
            ? "bg-surface border-default opacity-80 cursor-not-allowed"
            : "bg-surface-raised border-default hover:border-strong cursor-pointer active:bg-surface focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2",
          className
        )}
      >
        {/* Top row: Departure time, arrow, arrival time, and fare */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <div className="flex flex-col">
              <span className="text-h2 font-semibold font-tabular text-fg tracking-tight">
                {departureTime}
              </span>
            </div>

            <div className="flex items-center gap-1 text-subtle px-1">
              <span className="text-caption text-muted">{duration}</span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            </div>

            <div className="flex flex-col">
              <span className="text-body-lg font-medium font-tabular text-fg">
                {arrivalTime}
              </span>
              <span className="text-caption text-subtle">{approxLabel}</span>
            </div>
          </div>

          <div className="text-right shrink-0">
            <span className="text-h3 font-semibold font-tabular text-fg block">
              {fareFormatted}
            </span>
          </div>
        </div>

        {/* Middle row: Service type name and route code */}
        <div className="mt-2 flex items-center gap-2 flex-wrap min-w-0">
          <span className="text-small font-medium text-fg">
            {serviceTypeName}
          </span>
          {routeCode && (
            <span className="text-caption text-subtle font-mono">
              ({routeCode})
            </span>
          )}
          <span className="text-small text-muted truncate">
            to {destinationName}
          </span>
        </div>

        {/* Bottom row: Badges, seats left, free travel chip */}
        <div className="mt-3 pt-3 border-t border-default flex items-center justify-between gap-2 flex-wrap min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {isNonUpcoming && statusLabel && (
              <StatusBadge status={status} label={statusLabel} size="sm" />
            )}
            {freeTravelEligible && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-caption font-medium bg-status-success-soft text-status-success border border-status-success-soft">
                <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span>{freeTravelLabel}</span>
              </span>
            )}
          </div>

          <div className="ml-auto text-right">
            <span
              className={cn(
                "text-small font-medium font-tabular",
                isFull
                  ? "text-status-danger"
                  : isLowSeats
                  ? "text-status-warning"
                  : "text-muted"
              )}
            >
              {displaySeatsText}
            </span>
          </div>
        </div>
      </div>
    );

    if (href && !isFull) {
      return (
        <a
          href={href}
          aria-label={accessibleName}
          className="block outline-none focus-visible:outline-none select-none rounded-lg"
          data-testid={(props as Record<string, unknown>)["data-testid"] as string | undefined}
        >
          {content}
        </a>
      );
    }

    return (
      <div
        ref={ref}
        aria-label={accessibleName}
        role={isFull ? undefined : "button"}
        aria-disabled={isFull ? "true" : undefined}
        {...props}
      >
        {content}
      </div>
    );
  }
);
TripCard.displayName = "TripCard";
