"use client";
import { formatTime, STATUS_MAP, TripDetailDto } from "@aptransit/shared";
import {
  Button,
  ErrorState,
  RouteProgress,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
  Skeleton,
  StatusBadge,
} from "@aptransit/ui";
import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import Link from "next/link";
import { api, errorKey } from "../../../../lib/api";
import { useLiveTrip } from "../../../../lib/use-live-trip";
import { useNow } from "../../../../lib/use-browser-state";
import { shouldPollLive } from "../../../../lib/socket";
const MapView = dynamic(() => import("@aptransit/ui/map-view"), {
  ssr: false,
  loading: () => <Skeleton className="h-tracking-map w-full" />,
});
export function TrackTrip({ tripId }: { tripId: string }) {
  const t = useTranslations("tracking"),
    root = useTranslations(),
    locale = useLocale(),
    now = useNow();
  const live = useLiveTrip(tripId);
  const detail = useQuery({
    queryKey: ["trip", tripId],
    queryFn: ({ signal }) =>
      api(`/trips/${tripId}`, { schema: TripDetailDto, signal, redirectOn401: false }),
  });
  if (live.isLoading || detail.isLoading)
    return (
      <div className="px-gutter py-6" aria-busy="true">
        <h1 className="sr-only">{t("title")}</h1>
        <Skeleton className="h-tracking-map w-full" />
        <Skeleton className="mt-4 h-32 w-full" />
      </div>
    );
  if (live.isError || detail.isError || !live.data || !detail.data)
    return (
      <ErrorState
        headingLevel="h1"
        title={t("errorTitle")}
        message={root(errorKey(live.error ?? detail.error, (k) => root.has(k)))}
        retryLabel={root("common.retry")}
        onRetry={() => {
          void live.refetch();
          void detail.refetch();
        }}
      />
    );
  const data = live.data,
    trip = detail.data;
  const name = (s: { nameEn: string; nameTe: string }) => (locale === "te" ? s.nameTe : s.nameEn);
  const age =
    data.position && now
      ? Math.max(0, Math.floor((now - Date.parse(data.position.recordedAt)) / 1000))
      : null;
  const progress = (
    <RouteProgress
      stops={data.progress.map((s) => ({
        stopId: s.stopId,
        name: name(s),
        state: s.state,
        eta: s.etaAt ? formatTime(s.etaAt, locale) : null,
      }))}
      labels={{
        done: t("done"),
        current: t("current"),
        upcoming: t("upcoming"),
        delay: (n) => t("delay", { minutes: n }),
        incident: data.incidentTypes.length
          ? data.incidentTypes.map((type) => root(`driverApp.report.types.${type}`)).join(", ")
          : t("incident"),
      }}
      delayMinutes={data.delayMinutes}
      incident={data.hasOpenIncident}
    />
  );
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-gutter py-6">
      <h1 className="text-h1">{name(trip.route)}</h1>
      <MapView
        polyline={trip.route.polyline}
        stops={trip.route.stops}
        position={data.position}
        progressPct={data.progressPct}
        nextStopId={data.nextStop?.stopId ?? null}
        mapStyle={
          process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty"
        }
        recenterLabel={t("recenter")}
        errorLabel={t("mapError")}
        retryLabel={root("common.retry")}
      />
      <section
        className="flex flex-col gap-3 rounded-lg border border-default bg-surface-raised p-4"
        aria-labelledby="live-details"
      >
        <h2 id="live-details" className="text-h2">
          {t("details")}
        </h2>
        <StatusBadge
          status={data.displayStatus}
          label={root(STATUS_MAP[data.displayStatus].i18nKey)}
        />
        {data.status === "SCHEDULED" ? (
          <p>
            {t("notStarted", {
              stop: name(trip.route.origin),
              time: formatTime(trip.scheduledDepartureAt, locale),
            })}
          </p>
        ) : data.status === "COMPLETED" ? (
          <>
            <p>{t("completed")}</p>
            <Button asChild variant="secondary">
              <Link href={`/feedback?tripId=${tripId}`}>{t("feedback")}</Link>
            </Button>
          </>
        ) : (
          <>
            <p className="text-small text-muted">{t("nextStop")}</p>
            <p data-testid="next-stop" className="text-h2">
              {data.nextStop ? name(data.nextStop) : name(trip.route.destination)}
            </p>
            <p data-testid="live-eta" className="text-body tabular-nums">
              {data.etaNextStopSec === null
                ? t("waiting")
                : data.etaNextStopSec <= 60
                  ? t("arriving")
                  : t("eta", { minutes: Math.ceil(data.etaNextStopSec / 60) })}
            </p>
          </>
        )}
        <p
          className={
            age !== null && age > 60
              ? "flex gap-2 text-small text-status-warning"
              : "flex gap-2 text-small text-muted"
          }
        >
          <Clock className="size-5" aria-hidden="true" />
          {age === null ? t("waiting") : t("updated", { seconds: age })}
        </p>
        {shouldPollLive(now) && (
          <p role="status" className="text-small text-muted">
            {t("connectionFallback")}
          </p>
        )}
      </section>
      <section aria-labelledby="progress-title">
        <h2 id="progress-title" className="text-h2">
          {t("routeProgress")}
        </h2>
        {progress}
      </section>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="secondary">{t("showStops")}</Button>
        </SheetTrigger>
        <SheetContent closeLabel={root("common.close")}>
          <SheetTitle>{t("routeProgress")}</SheetTitle>
          <SheetDescription>{name(trip.route)}</SheetDescription>
          {progress}
        </SheetContent>
      </Sheet>
    </div>
  );
}
