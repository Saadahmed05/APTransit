"use client";
import { ConductorAlightingDto } from "@aptransit/shared";
import { Button, Skeleton, cn } from "@aptransit/ui";
import { useQuery } from "@tanstack/react-query";
import { MapPinned } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api, errorKey } from "../lib/api";

/**
 * D-044: who gets down at the stops ahead. Lives under the "conductor" query key, so every scan
 * (and the conductor:counts socket event) refreshes it; the timer follows the bus between stops.
 */
export function useAlighting(tripId: string | undefined) {
  return useQuery({
    queryKey: ["conductor", "alighting", tripId],
    enabled: Boolean(tripId),
    refetchInterval: 30_000,
    queryFn: ({ signal }) =>
      api("/conductor/trips/" + tripId + "/alighting", { schema: ConductorAlightingDto, signal }),
  });
}

/**
 * "Nandyal, next stop: 2 get down", then the later stops. `compact` is the one line banner of the
 * scanner; the full panel is for the conductor home.
 */
export function AlightingPanel({ tripId, compact = false }: { tripId: string; compact?: boolean }) {
  const t = useTranslations("conductorApp.getDown"),
    root = useTranslations(),
    locale = useLocale(),
    query = useAlighting(tripId);
  const name = (stop: { nameEn: string; nameTe: string }) => (locale === "te" ? stop.nameTe : stop.nameEn);
  if (query.isLoading) return <Skeleton className={compact ? "h-14 w-full" : "h-32 w-full"} />;
  if (query.isError)
    return (
      <div role="alert" className="flex flex-col gap-2 rounded-lg border border-default bg-surface-raised p-4">
        <p>{t("loadFailed")}</p>
        <p className="text-small text-muted">{root(errorKey(query.error, (k) => root.has(k)))}</p>
        <Button size="xl" variant="secondary" onClick={() => void query.refetch()}>
          {root("common.retry")}
        </Button>
      </div>
    );
  const data = query.data!;
  const next = data.stops.find((stop) => stop.next);
  const headline = next
    ? t("atStop", { stop: name(next), count: next.count })
    : data.nextStop
      ? t("nobodyAt", { stop: name(data.nextStop) })
      : data.onBoard === 0
        ? t("empty")
        : t("nextUnknown");
  if (compact)
    return (
      <p
        role="status"
        aria-live="polite"
        className={cn(
          "flex min-h-14 items-center gap-2 rounded-md p-3 text-h3",
          next ? "bg-status-warning-soft text-status-warning" : "bg-surface-raised text-fg",
        )}
      >
        <MapPinned className="size-6 shrink-0" aria-hidden="true" />
        <span className="min-w-0">{headline}</span>
      </p>
    );
  const later = data.stops.filter((stop) => !stop.next);
  return (
    <section aria-labelledby="get-down-title" className="flex flex-col gap-3 rounded-lg border border-default bg-surface-raised p-4">
      <h2 id="get-down-title" className="text-h3">
        {t("title")}
      </h2>
      <p
        role="status"
        aria-live="polite"
        className={cn(
          "flex items-center gap-2 rounded-md p-3 text-h2",
          next ? "bg-status-warning-soft text-status-warning" : "bg-surface text-fg",
        )}
      >
        <MapPinned className="size-6 shrink-0" aria-hidden="true" />
        <span className="min-w-0">{headline}</span>
      </p>
      {later.length > 0 && (
        <ul className="divide-y divide-default">
          {later.map((stop) => (
            <li key={stop.stopId} className="flex min-h-14 items-center justify-between gap-3">
              <span className="min-w-0">{name(stop)}</span>
              <span className="font-semibold tabular-nums">{t("count", { count: stop.count })}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-small text-muted">{t("onBoard", { count: data.onBoard })}</p>
      <p className="text-small text-muted">{t("passesNote")}</p>
    </section>
  );
}
