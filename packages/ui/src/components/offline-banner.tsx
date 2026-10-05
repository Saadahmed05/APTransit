import * as React from "react";
import { WifiOff } from "lucide-react";
import { cn } from "../cn";

export interface OfflineBannerProps extends React.HTMLAttributes<HTMLDivElement> {
  message: string;
}

/** Shows when the device is offline (docs/09). The caller decides when; this only renders. */
export const OfflineBanner = React.forwardRef<HTMLDivElement, OfflineBannerProps>(({ message, className, ...props }, ref) => (
  <div
    ref={ref}
    role="status"
    className={cn("flex items-center gap-2 rounded-md bg-status-warning-soft px-3 py-2 text-small text-status-warning", className)}
    {...props}
  >
    <WifiOff className="size-4 shrink-0" aria-hidden="true" />
    <span className="min-w-0">{message}</span>
  </div>
));
OfflineBanner.displayName = "OfflineBanner";
