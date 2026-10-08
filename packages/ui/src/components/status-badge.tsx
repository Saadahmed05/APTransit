import * as React from "react";
import {
  INCIDENT_STATUS_MAP,
  STATUS_MAP,
  TICKET_STATUS_MAP,
} from "@aptransit/shared";
import type {
  DisplayStatus,
  StatusTone,
  TicketStatus,
  IncidentStatus,
} from "@aptransit/shared";
import {
  Bus,
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock,
  Settings,
  Timer,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../cn";

const ICON_MAP: Record<string, LucideIcon> = {
  clock: Clock,
  bus: Bus,
  timer: Timer,
  "circle-check": CircleCheck,
  "circle-x": CircleX,
  "triangle-alert": TriangleAlert,
  wrench: Wrench,
  settings: Settings,
  "circle-dashed": CircleDashed,
};

const TONE_CLASSES: Record<
  StatusTone,
  { soft: string; solid: string; text: string }
> = {
  success: {
    soft: "bg-status-success-soft text-status-success",
    solid: "bg-status-success-solid text-on-solid",
    text: "text-status-success",
  },
  info: {
    soft: "bg-status-info-soft text-status-info",
    solid: "bg-status-info-solid text-on-solid",
    text: "text-status-info",
  },
  warning: {
    soft: "bg-status-warning-soft text-status-warning",
    solid: "bg-status-warning-solid text-on-solid",
    text: "text-status-warning",
  },
  danger: {
    soft: "bg-status-danger-soft text-status-danger",
    solid: "bg-status-danger-solid text-on-solid",
    text: "text-status-danger",
  },
  maintenance: {
    soft: "bg-status-maintenance-soft text-status-maintenance",
    solid: "bg-status-maintenance-solid text-on-solid",
    text: "text-status-maintenance",
  },
  neutral: {
    soft: "bg-status-neutral-soft text-status-neutral",
    solid: "bg-status-neutral-solid text-on-solid",
    text: "text-status-neutral",
  },
};

export interface ToneChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone: StatusTone;
  label: string;
  icon?: LucideIcon;
  solid?: boolean;
  size?: "sm" | "md";
}

export const ToneChip = React.forwardRef<HTMLSpanElement, ToneChipProps>(
  (
    {
      tone,
      label,
      icon: Icon,
      solid = false,
      size = "md",
      className,
      ...props
    },
    ref
  ) => {
    const toneStyles = TONE_CLASSES[tone];
    const sizeClasses =
      size === "sm"
        ? "h-6 px-2 text-caption gap-1 rounded-full font-medium"
        : "h-7 px-2.5 text-small gap-1.5 rounded-full font-medium";

    const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center select-none",
          sizeClasses,
          solid ? toneStyles.solid : toneStyles.soft,
          className
        )}
        {...props}
      >
        {Icon && <Icon className={cn("shrink-0", iconSize)} aria-hidden="true" />}
        <span className="truncate">{label}</span>
      </span>
    );
  }
);
ToneChip.displayName = "ToneChip";

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: DisplayStatus;
  label: string;
  size?: "sm" | "md";
  solid?: boolean;
}

export const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ status, label, size = "md", solid = false, className, ...props }, ref) => {
    const meta = STATUS_MAP[status];
    const Icon = meta ? ICON_MAP[meta.icon] || Clock : Clock;
    const tone = meta ? meta.tone : "neutral";

    return (
      <ToneChip
        ref={ref}
        tone={tone}
        label={label}
        icon={Icon}
        size={size}
        solid={solid}
        className={className}
        data-status={status}
        {...props}
      />
    );
  }
);
StatusBadge.displayName = "StatusBadge";

export interface TicketStatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: TicketStatus;
  /** Translated label from TICKET_STATUS_MAP[status].i18nKey (docs/07 section 3). */
  label: string;
  size?: "sm" | "md";
}

/** Ticket status (Not active, Active, Checked...) with tone and icon from packages/shared. */
export const TicketStatusBadge = React.forwardRef<HTMLSpanElement, TicketStatusBadgeProps>(
  ({ status, label, size = "md", ...props }, ref) => {
    const meta = TICKET_STATUS_MAP[status];
    return <ToneChip ref={ref} tone={meta.tone} label={label} icon={ICON_MAP[meta.icon] ?? Clock} size={size} {...props} />;
  }
);
TicketStatusBadge.displayName = "TicketStatusBadge";

export function IncidentStatusBadge({status,label}:{status:IncidentStatus;label:string}) { const meta=INCIDENT_STATUS_MAP[status];return <ToneChip tone={meta.tone} icon={ICON_MAP[meta.icon]??Clock} label={label}/>; }
