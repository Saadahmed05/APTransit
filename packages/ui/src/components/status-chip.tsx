import * as React from "react";
import type { StatusTone } from "@aptransit/shared";
import type { LucideIcon } from "lucide-react";
import { ToneChip } from "./status-badge";

export interface StatusChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone: StatusTone;
  /** Visible label, already translated. A chip is never colour alone. */
  label: string;
  icon: LucideIcon;
  /** Announce changes (online, GPS, scanner state) to screen readers. */
  live?: boolean;
}

/**
 * Small soft chip for device and trip state in the field apps: online, GPS, trip, scanner.
 * Tone, icon and label come from packages/shared/src/status.ts; this only renders them.
 * For bus and ticket status use StatusBadge.
 */
export const StatusChip = React.forwardRef<HTMLSpanElement, StatusChipProps>(
  ({ tone, label, icon, live = false, ...props }, ref) => (
    <ToneChip
      ref={ref}
      tone={tone}
      label={label}
      icon={icon}
      size="sm"
      role={live ? "status" : undefined}
      {...props}
    />
  ),
);
StatusChip.displayName = "StatusChip";
