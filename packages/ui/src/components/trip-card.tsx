import * as React from "react";
import type { DisplayStatus } from "@aptransit/shared";
import { ArrowRight, Sparkles } from "lucide-react";
import { cn } from "../cn";
import { StatusBadge } from "./status-badge";

export interface TripCardProps extends React.HTMLAttributes<HTMLElement> {
  departureTime: string;
  arrivalTime: string;
  duration: string;
  serviceTypeName: string;
  /** Visible destination line, already translated (for example "to Vijayawada"). */
  destinationText: string;
  seatsLeft: number;
  fareFormatted: string;
  status?: DisplayStatus;
  statusLabel?: string;
  freeTravelEligible?: boolean;
  freeTravelLabel: string;
  approxLabel: string;
  seatsLeftText: string;
  fullLabel: string;
  /** Accessible name for the whole card, already translated. */
  label: string;
  href?: string;
  routeCode?: string;
  /** Link component, for example next/link, so navigation stays client side. Defaults to a plain anchor. */
  linkAs?: React.ElementType;
}

export const TripCard = React.forwardRef<HTMLElement, TripCardProps>(
  (
    {
      departureTime,
      arrivalTime,
      duration,
      serviceTypeName,
      destinationText,
      seatsLeft,
      fareFormatted,
      status = "UPCOMING",
      statusLabel,
      freeTravelEligible = false,
      freeTravelLabel,
      approxLabel,
      seatsLeftText,
      fullLabel,
      label,
      href,
      routeCode,
      linkAs: LinkComponent = "a",
      className,
      ...props
    },
    ref
  ) => {
    const isFull = seatsLeft <= 0;
    const isLowSeats = seatsLeft > 0 && seatsLeft <= 5;
    const isNonUpcoming = status !== "UPCOMING";
    const isLink = Boolean(href) && !isFull;

    const displaySeatsText = isFull ? fullLabel : seatsLeftText;

    const content = (
      <div
        className={cn(
          "rounded-lg border p-4 transition-colors relative",
          isLink && "press-scale",
          isFull
            ? "bg-surface border-default opacity-80 cursor-not-allowed"
            : "bg-surface-raised border-default hover:border-strong active:bg-surface",
          isLink && "cursor-pointer"
        )}
      >
        {/* Top row: Departure time, arrow, arrival time, and fare */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <div className="flex flex-col">
              <span className="text-h2 font-semibold tabular-nums text-fg">
                {departureTime}
              </span>
            </div>

            <div className="flex items-center gap-1 text-subtle px-1">
              <span className="text-caption text-muted">{duration}</span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            </div>

            <div className="flex flex-col">
              <span className="text-body-lg font-medium tabular-nums text-fg">
                {arrivalTime}
              </span>
              <span className="text-caption text-subtle">{approxLabel}</span>
            </div>
          </div>

          <div className="text-right shrink-0">
            <span className="text-h3 font-semibold tabular-nums text-fg block">
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
          <span className="text-small text-muted min-w-0 break-words">
            {destinationText}
          </span>
        </div>

        {/* Bottom row: Badges, seats left, free travel chip */}
        <div className="mt-3 flex items-center justify-between gap-2 flex-wrap min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {isNonUpcoming && statusLabel && (
              <StatusBadge status={status} label={statusLabel} size="sm" />
            )}
            {freeTravelEligible && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-caption font-medium bg-status-success-soft text-status-success">
                <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span>{freeTravelLabel}</span>
              </span>
            )}
          </div>

          <div className="ml-auto text-right">
            <span
              className={cn(
                "text-small font-medium tabular-nums",
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

    if (isLink) {
      return (
        <LinkComponent
          ref={ref}
          href={href}
          aria-label={label}
          className={cn(
            "block rounded-lg outline-none select-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
            className
          )}
          {...props}
        >
          {content}
        </LinkComponent>
      );
    }

    // Full or not linked: a labelled group, not a control
    return (
      <div
        ref={ref as React.Ref<HTMLDivElement>}
        role="group"
        aria-label={label}
        aria-disabled={isFull ? "true" : undefined}
        className={className}
        {...props}
      >
        {content}
      </div>
    );
  }
);
TripCard.displayName = "TripCard";
