"use client";

import {
  formatDate,
  formatDistance,
  formatDuration,
  formatIstDate,
  formatTime,
  RouteDto,
  TimetableDto,
  type TripSummaryDto,
} from "@aptransit/shared";
import {
  Button,
  Card,
  DatePicker,
  EmptyState,
  ErrorState,
  Skeleton,
  StatusBadge,
} from "@aptransit/ui";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Bus,
  ChevronRight,
  Home,
  MapPin,
  Navigation,
  Sparkles,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { api, errorKey } from "../../../../../lib/api";
import { queryKeys } from "../../../../../lib/query-keys";

const MAX_DAYS_AHEAD = 30;

export function RouteTimetableClient({
  routeId,
  initialDate,
}: {
  routeId: string;
  initialDate?: string;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [today] = useState(() => formatIstDate(new Date()));
  const date = searchParams.get("date") ?? initialDate ?? today;

  // 1. Fetch Route Information
  const routeQuery = useQuery({
    queryKey: queryKeys.route(routeId),
    queryFn: ({ signal }) =>
      api(`/routes/${routeId}`, {
        schema: RouteDto,
        signal,
        redirectOn401: false,
      }),
  });

  // 2. Fetch Timetable for the given date
  const timetableQuery = useQuery({
    queryKey: queryKeys.timetable(routeId, date),
    queryFn: ({ signal }) =>
      api(`/routes/${routeId}/timetable`, {
        query: { date },
        schema: TimetableDto,
        signal,
        redirectOn401: false,
      }),
  });

  const onDateChange = (nextDate: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", nextDate);
    router.push(`/timetable/route/${routeId}?${params.toString()}`);
  };

  if (routeQuery.isLoading) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <span className="sr-only" role="status">
          {t("common.loading")}
        </span>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (routeQuery.isError) {
    return (
      <ErrorState
        title={t("timetable.errorTitle")}
        message={t(errorKey(routeQuery.error, (k) => t.has(k)))}
        retryLabel={t("common.retry")}
        onRetry={() => {
          routeQuery.refetch();
          timetableQuery.refetch();
        }}
      />
    );
  }

  const route = routeQuery.data;
  if (!route) {
    return (
      <EmptyState
        icon={Navigation}
        title={t("timetable.noRoutesFound")}
        action={
          <Button variant="primary" onClick={() => router.push("/timetable")}>
            {t("timetable.breadcrumbTimetable")}
          </Button>
        }
      />
    );
  }

  const routeName = locale === "te" ? route.nameTe : route.nameEn;
  const originName = locale === "te" ? route.origin.nameTe : route.origin.nameEn;
  const destName = locale === "te" ? route.destination.nameTe : route.destination.nameEn;
  const timetable = timetableQuery.data;

  const nextBusFormatted = timetable?.nextDepartureAt
    ? formatTime(timetable.nextDepartureAt, locale)
    : null;

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Breadcrumb Navigation */}
      <nav aria-label={t("common.breadcrumb")} className="flex items-center gap-2 text-small text-muted flex-wrap">
        <Link
          href="/"
          className="inline-flex items-center gap-1 hover:text-fg transition-colors"
        >
          <Home className="size-4" aria-hidden="true" />
          <span>{t("timetable.breadcrumbHome")}</span>
        </Link>

        <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden="true" />

        <Link
          href="/timetable"
          className="hover:text-fg transition-colors"
        >
          {t("timetable.breadcrumbTimetable")}
        </Link>

        <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden="true" />

        <span className="font-semibold text-fg truncate">
          {routeName}
        </span>
      </nav>

      {/* Header Route Card */}
      <Card padding="lg" className="flex flex-col gap-4 border-default bg-surface-raised">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-h2 font-bold text-fg">
                {routeName}
              </h1>
              <span className="px-2 py-0.5 rounded-sm text-caption font-mono font-medium bg-surface text-muted border border-default">
                {route.code}
              </span>
            </div>

            <div className="mt-1 flex items-center gap-2 text-small text-muted flex-wrap">
              <span>{originName}</span>
              <ArrowRight className="size-3.5 text-subtle" aria-hidden="true" />
              <span>{destName}</span>
              <span aria-hidden="true">·</span>
              <span>{formatDistance(route.distanceKm, locale)}</span>
            </div>
          </div>
        </div>

        {/* Timetable Highlights: First, Last, Next Bus, Frequency */}
        {timetable && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-default pt-4">
            <div className="flex flex-col rounded-md bg-surface p-2.5 border border-default">
              <span className="text-caption text-muted">{t("timetable.firstBus")}</span>
              <span className="text-body font-bold font-tabular text-fg">
                {timetable.firstDepartureLocal ?? t("common.notAvailable")}
              </span>
            </div>

            <div className="flex flex-col rounded-md bg-surface p-2.5 border border-default">
              <span className="text-caption text-muted">{t("timetable.lastBus")}</span>
              <span className="text-body font-bold font-tabular text-fg">
                {timetable.lastDepartureLocal ?? t("common.notAvailable")}
              </span>
            </div>

            <div className="flex flex-col rounded-md bg-surface p-2.5 border border-default">
              <span className="text-caption text-muted">{t("timetable.nextBus")}</span>
              <span className="text-body font-bold font-tabular text-primary">
                {nextBusFormatted ?? t("common.notAvailable")}
              </span>
            </div>

            <div className="flex flex-col rounded-md bg-surface p-2.5 border border-default">
              <span className="text-caption text-muted">{t("timetable.frequency")}</span>
              <span className="text-body font-bold text-fg">
                {timetable.frequencyMin
                  ? t("timetable.everyMinutes", { minutes: timetable.frequencyMin })
                  : t("common.notAvailable")}
              </span>
            </div>
          </div>
        )}
      </Card>

      {/* Date Switcher */}
      <div className="flex flex-col gap-2">
        <span className="text-small font-medium text-fg">
          {t("timetable.dateSelector")}
        </span>
        <DatePicker
          value={date}
          onChange={onDateChange}
          today={today}
          maxDaysAhead={MAX_DAYS_AHEAD}
          locale={locale === "te" ? "te-IN" : "en-IN"}
          groupLabel={t("common.date")}
          labels={{
            today: t("home.date.today"),
            tomorrow: t("home.date.tomorrow"),
            pickDate: t("home.date.pick"),
            close: t("common.close"),
            previousMonth: t("home.date.previousMonth"),
            nextMonth: t("home.date.nextMonth"),
          }}
        />
      </div>

      {/* Grid: Trips for Date on Left/Top, Ordered Stops on Right/Bottom */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Day's Trips List */}
        <section aria-labelledby="trips-heading" className="md:col-span-7 flex flex-col gap-4">
          <h2 id="trips-heading" className="text-body-lg font-bold text-fg">
            {t("timetable.departuresToday", {
              date: formatDate(new Date(`${date}T00:00:00.000Z`), locale),
            })}
          </h2>

          {timetableQuery.isLoading && (
            <div className="flex flex-col gap-3" aria-busy="true">
              <span className="sr-only" role="status">
                {t("common.loading")}
              </span>
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          )}

          {timetableQuery.isError && (
            <ErrorState
              title={t("timetable.errorTitle")}
              message={t(errorKey(timetableQuery.error, (k) => t.has(k)))}
              retryLabel={t("common.retry")}
              onRetry={() => timetableQuery.refetch()}
            />
          )}

          {timetableQuery.isSuccess && timetable?.trips.length === 0 && (
            <EmptyState
              icon={Bus}
              title={t("timetable.noTripsForDate")}
            />
          )}

          {timetableQuery.isSuccess && timetable && timetable.trips.length > 0 && (
            <div className="flex flex-col gap-2.5">
              {timetable.trips.map((trip: TripSummaryDto) => {
                const serviceKey = `serviceType.${trip.serviceType}`;
                const serviceName = t.has(serviceKey) ? t(serviceKey) : trip.serviceType;
                const depTime = formatTime(trip.departureAt, locale);
                const arrTime = formatTime(trip.arrivalAt, locale);
                const duration = formatDuration(trip.durationMin, locale);
                const statusKey = `status.${trip.displayStatus}`;
                const statusLabel = t.has(statusKey) ? t(statusKey) : trip.displayStatus;

                return (
                  <Link
                    key={trip.tripId}
                    href={`/bus/${trip.tripId}?${new URLSearchParams({ from: route.origin.id, to: route.destination.id }).toString()}`}
                    className="flex items-center justify-between p-3.5 rounded-lg border border-default bg-surface-raised hover:border-strong hover:bg-surface transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col">
                        <span className="text-h3 font-bold font-tabular text-fg">
                          {depTime}
                        </span>
                        <span className="text-caption text-muted">
                          {arrTime} ({duration})
                        </span>
                      </div>

                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-small font-medium text-fg">
                            {serviceName}
                          </span>
                          {trip.freeTravelEligible && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-caption font-medium bg-status-success-soft text-status-success">
                              <Sparkles className="size-3" aria-hidden="true" />
                              {t("search.freeTravelEligible")}
                            </span>
                          )}
                        </div>
                        <StatusBadge status={trip.displayStatus} label={statusLabel} size="sm" />
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-small font-semibold font-tabular text-fg block">
                        {trip.seatsLeft > 0
                          ? t("common.seatsLeft", { count: trip.seatsLeft })
                          : t("search.full")}
                      </span>
                      <ChevronRight className="size-4 text-subtle ml-auto mt-1" aria-hidden="true" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Ordered Stops List */}
        <section aria-labelledby="stops-heading" className="md:col-span-5 flex flex-col gap-4">
          <Card padding="md" className="flex flex-col gap-3">
            <h2 id="stops-heading" className="text-body font-semibold text-fg flex items-center gap-2">
              <MapPin className="size-4 text-muted" aria-hidden="true" />
              {t("timetable.stops")} ({route.stops.length})
            </h2>

            <div className="relative pl-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-default space-y-3.5">
              {route.stops.map((stop, index) => {
                const isFirst = index === 0;
                const isLast = index === route.stops.length - 1;
                const name = locale === "te" ? stop.nameTe : stop.nameEn;

                return (
                  <div key={stop.stopId} className="relative flex items-start justify-between gap-2">
                    <span
                      className={`absolute -left-6 top-1.5 size-2.5 rounded-full border-2 bg-surface ${
                        isFirst
                          ? "border-primary bg-primary"
                          : isLast
                          ? "border-status-danger bg-status-danger"
                          : "border-muted"
                      }`}
                      aria-hidden="true"
                    />

                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-small font-medium text-fg truncate">
                        {name}
                      </span>
                      <span className="text-caption text-muted">
                        {formatDistance(stop.kmFromOrigin, locale)}
                        {stop.minutesFromOrigin > 0 && ` · +${formatDuration(stop.minutesFromOrigin, locale)}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
