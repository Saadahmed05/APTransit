import type { ReactNode } from "react";
import type { StatusTone } from "@aptransit/shared";
import { Skeleton } from "./skeleton";
import { cn } from "../cn";
export interface KpiTileProps {
  label: string;
  value: string | number;
  loading?: boolean;
  href?: string;
  delta?: { label: string; tone: StatusTone; icon: ReactNode };
}
const tones: Record<StatusTone, string> = {
  success: "text-status-success",
  info: "text-status-info",
  warning: "text-status-warning",
  danger: "text-status-danger",
  maintenance: "text-status-maintenance",
  neutral: "text-status-neutral",
};
export function KpiTile({ label, value, loading, href, delta }: KpiTileProps) {
  const content = (
    <>
      <p className="text-small text-muted">{label}</p>
      {loading ? (
        <Skeleton className="h-12 w-24" />
      ) : (
        <p className="text-display tabular-nums">{value}</p>
      )}
      {delta && (
        <p className={cn("flex items-center gap-2 text-small", tones[delta.tone])}>
          {delta.icon}
          <span>{delta.label}</span>
        </p>
      )}
    </>
  );
  return href ? (
    <a
      href={href}
      className="flex min-h-11 flex-col gap-2 rounded-lg border border-default bg-surface p-4"
      aria-busy={loading || undefined}
    >
      {content}
    </a>
  ) : (
    <div
      className="flex flex-col gap-2 rounded-lg border border-default bg-surface p-4"
      aria-busy={loading || undefined}
    >
      {content}
    </div>
  );
}
