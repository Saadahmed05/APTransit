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
// Soft chip: text colour on the soft background of the same tone (docs/09)
const tones: Record<StatusTone, string> = {
  success: "bg-status-success-soft text-status-success",
  info: "bg-status-info-soft text-status-info",
  warning: "bg-status-warning-soft text-status-warning",
  danger: "bg-status-danger-soft text-status-danger",
  maintenance: "bg-status-maintenance-soft text-status-maintenance",
  neutral: "bg-status-neutral-soft text-status-neutral",
};
export function KpiTile({ label, value, loading, href, delta }: KpiTileProps) {
  const content = (
    <>
      <p className="text-caption text-muted">{label}</p>
      {loading ? (
        <Skeleton className="h-12 w-24" />
      ) : (
        <p className="text-display-lg tabular-nums">{value}</p>
      )}
      {delta && (
        <p className={cn("flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-caption", tones[delta.tone])}>
          {delta.icon}
          <span>{delta.label}</span>
        </p>
      )}
    </>
  );
  return href ? (
    <a
      href={href}
      className="flex min-h-11 flex-col gap-2 rounded-lg border border-default bg-surface-raised p-4"
      aria-busy={loading || undefined}
    >
      {content}
    </a>
  ) : (
    <div
      className="flex flex-col gap-2 rounded-lg border border-default bg-surface-raised p-4"
      aria-busy={loading || undefined}
    >
      {content}
    </div>
  );
}
