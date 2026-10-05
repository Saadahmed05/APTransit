"use client";

import {
  FareDto,
  formatDate,
  PassDto,
  formatDistance,
  formatDuration,
  formatMoney,
  formatTime,
  TripDetailDto,
} from "@aptransit/shared";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
  StatusBadge,
} from "@aptransit/ui";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Bus,
  HeartHandshake,
  Clock,
  CreditCard,
  Info,
  MapPin,
  Navigation,
  Sparkles,
  Ticket,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { useAuth } from "../../../../components/auth-provider";
import { api, errorKey, isApiError } from "../../../../lib/api";
import { queryKeys } from "../../../../lib/query-keys";
import { useNow } from "../../../../lib/use-browser-state";

export function BusDetailClient({
  tripId,
  initialFrom,
  initialTo,
}: {
  tripId: string;
  initialFrom?: string;
  initialTo?: string;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  const from = searchParams.get("from") ?? initialFrom ?? undefined;
  const to = searchParams.get("to") ?? initialTo ?? undefined;

  // 1. Fetch Trip details
  const tripQuery = useQuery({
    queryKey: queryKeys.trip(tripId, from, to),
    queryFn: ({ signal }) =>
      api(`/trips/${tripId}`, {
        query: { from, to },
        schema: TripDetailDto,
        signal,
        redirectOn401: false,
      }),
  });

  // 2. Fetch Fare breakdown (when from & to are known)
  const fareQuery = useQuery({
    queryKey: queryKeys.tripFare(tripId, from ?? "", to ?? ""),
    queryFn: ({ signal }) =>
      api(`/trips/${tripId}/fare`, {
        query: { from: from!, to: to! },
        schema: FareDto,
        signal,
        redirectOn401: false,
      }),
    enabled: Boolean(from && to),
  });

  // 3. Logged in citizens with an active free travel pass get a "Book free seat" path (Day 9)
  const { status: authStatus } = useAuth();
  const now = useNow(60_000);
  const passesQuery = useQuery({
    queryKey: queryKeys.passes,
    queryFn: ({ signal }) => api("/passes", { schema: z.array(PassDto), signal, redirectOn401: false }),
    enabled: authStatus === "authenticated",
  });
  const hasFreePass = (passesQuery.data ?? []).some(
    (p) => p.kind === "FREE_TRAVEL" && p.status === "ACTIVE" && p.validUntil !== null && now > 0 && Date.parse(p.validUntil) > now,
  );

  if (tripQuery.isLoading) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <span className="sr-only" role="status">
          {t("common.loading")}
        </span>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-44 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  const notFound = isApiError(tripQuery.error) && tripQuery.error.code === "NOT_FOUND";
  if (tripQuery.isError && !notFound) {
    return (
      <ErrorState
        title={t("bus.errorTitle")}
        message={t(errorKey(tripQuery.error, (k) => t.has(k)))}
        retryLabel={t("common.retry")}
        onRetry={() => {
          tripQuery.refetch();
          fareQuery.refetch();
        }}
      />
    );
  }

  const trip = tripQuery.data;
  if (!trip) {
    return (
      <EmptyState
        icon={Bus}
        title={t("bus.notFoundTitle")}
        hint={t("bus.notFoundHint")}
        action={
          <Button variant="primary" onClick={() => router.push("/")}>
            {t("common.goHome")}
          </Button>
        }
      />
    );
  }

  const serviceKey = `serviceType.${trip.busType.serviceType}`;
  const serviceName = t.has(serviceKey) ? t(serviceKey) : trip.busType.nameEn;
  const statusKey = `status.${trip.displayStatus}`;
  const statusLabel = t.has(statusKey) ? t(statusKey) : trip.displayStatus;

  // The searched segment (from and to in the URL), else the whole route
  const boarding = trip.boardingPoints.find((bp) => bp.stopId === from);
  const dropping = trip.droppingPoints.find((dp) => dp.stopId === to);
  const pick = (place: { nameEn: string; nameTe: string }) => (locale === "te" ? place.nameTe : place.nameEn);
  const originName = pick(boarding ?? trip.route.origin);
  const destName = pick(dropping ?? trip.route.destination);
  const depTimeFormatted = formatTime(boarding?.departureAt ?? trip.scheduledDepartureAt, locale);
  const arrTimeFormatted = formatTime(dropping?.arrivalAt ?? trip.scheduledArrivalAt, locale);
  const segmentKm =
    boarding && dropping ? dropping.kmFromOrigin - boarding.kmFromOrigin : trip.route.distanceKm;
  const serviceDateFormatted = formatDate(new Date(`${trip.serviceDate}T00:00:00.000Z`), locale);

  const isFull = trip.seatsLeft <= 0;
  const canBook = !isFull && trip.bookingOpen;

  const fareData = fareQuery.data;
  const totalFarePaise = fareData?.totalPaise ?? trip.farePaise;

  const bookUrl = `/book/${tripId}${from && to ? `?${new URLSearchParams({ from, to }).toString()}` : ""}`;
  const trackUrl = `/track/${tripId}`;
  const freeUrl = `/book/${tripId}/free${from && to ? `?${new URLSearchParams({ from, to }).toString()}` : ""}`;
  const canBookFree = canBook && trip.freeTravelEligible && hasFreePass;
  const routeUrl = `/timetable/route/${trip.route.id}`;

  return (
    <div data-testid="bus-detail-content" className="flex flex-col gap-6 pb-12">
      {/* Top Bar with Back Button */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-body font-medium text-fg hover:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          <span>{t("common.back")}</span>
        </button>

        <Link
          href={routeUrl}
          className="inline-flex min-h-11 items-center rounded-md text-small font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {t("bus.viewRoute")}
        </Link>
      </div>

      {/* Main Bus Header Card */}
      <Card padding="lg" className="flex flex-col gap-4 border-default bg-surface-raised">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-h2 font-bold text-fg">
                {serviceName}
              </span>
              {trip.freeTravelEligible && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-caption font-medium bg-status-success-soft text-status-success border border-status-success-soft">
                  <Sparkles className="size-3" aria-hidden="true" />
                  {t("bus.freeTravelEligible")}
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2 text-caption text-muted flex-wrap">
              <span className="font-mono">{trip.route.code}</span>
              <span aria-hidden="true">·</span>
              <span>
                {t("bus.busNumber")}: {trip.busRegNo ?? t("bus.notAssigned")}
              </span>
              <span aria-hidden="true">·</span>
              <span>{serviceDateFormatted}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <StatusBadge status={trip.displayStatus} label={statusLabel} />
          </div>
        </div>

        {/* Departure -> Arrival Timeline Banner */}
        <div className="mt-2 rounded-md bg-surface p-4 border border-default flex items-center justify-between gap-4 flex-wrap">
          <div className="flex flex-col">
            <span className="text-caption text-subtle">{t("common.departure")}</span>
            <span className="text-h2 font-bold font-tabular text-fg">{depTimeFormatted}</span>
            <span className="text-small font-medium text-muted">{originName}</span>
          </div>

          <div className="flex flex-col items-center justify-center px-2 text-center">
            <span className="text-caption text-muted">
              {formatDistance(segmentKm, locale)}
            </span>
            <div className="flex items-center gap-1 text-subtle my-1">
              <div className="h-0.5 w-12 bg-default" />
              <ArrowRight className="size-4 text-muted" aria-hidden="true" />
            </div>
          </div>

          <div className="flex flex-col text-right">
            <span className="text-caption text-subtle">
              {t("common.arrival")} ({t("bus.approx")})
            </span>
            <span className="text-h2 font-bold font-tabular text-fg">{arrTimeFormatted}</span>
            <span className="text-small font-medium text-muted">{destName}</span>
          </div>
        </div>

        {/* Seats and Fare Row */}
        <div className="mt-2 flex items-center justify-between gap-4 border-t border-default pt-4 flex-wrap">
          <div>
            <span className="text-caption text-muted block">
              {t("common.seat")}
            </span>
            <span
              className={`text-body font-semibold font-tabular ${
                isFull
                  ? "text-status-danger"
                  : trip.seatsLeft <= 5
                  ? "text-status-warning"
                  : "text-fg"
              }`}
            >
              {isFull ? t("bus.busFull") : t("bus.seatsAvailable", { count: trip.seatsLeft })}
            </span>
          </div>

          {totalFarePaise !== undefined && (
            <div className="text-right">
              <span className="text-caption text-muted block">
                {t("bus.totalFare")}
              </span>
              <span className="text-h2 font-bold font-tabular text-fg">
                {formatMoney(totalFarePaise, locale)}
              </span>
            </div>
          )}
        </div>

        {/* Primary Action Buttons */}
        <div className="mt-2 flex items-center gap-3 flex-wrap">
          <Button
            size="xl"
            className="flex-1"
            disabled={!canBook}
            onClick={() => router.push(bookUrl)}
            leftIcon={<Ticket className="size-5" aria-hidden="true" />}
          >
            {!canBook
              ? isFull
                ? t("bus.busFull")
                : t("bus.bookingClosed")
              : t("bus.bookTicket")}
          </Button>

          {canBookFree && (
            <Button
              variant="secondary"
              size="xl"
              className="flex-1"
              onClick={() => router.push(freeUrl)}
              leftIcon={<HeartHandshake className="size-5" aria-hidden="true" />}
            >
              {t("bus.bookFree")}
            </Button>
          )}

          <Button
            variant="secondary"
            size="xl"
            onClick={() => router.push(trackUrl)}
            leftIcon={<Navigation className="size-5" aria-hidden="true" />}
          >
            {t("bus.trackBus")}
          </Button>
        </div>
      </Card>

      {/* Fare Breakdown & Refund Policy Card */}
      {fareData && (
        <Card padding="md" className="flex flex-col gap-3">
          <h2 className="text-body font-semibold text-fg flex items-center gap-2">
            <CreditCard className="size-4 text-muted" aria-hidden="true" />
            {t("bus.fareBreakdown")}
          </h2>

          <div className="divide-y divide-default rounded-md border border-default bg-surface">
            <div className="flex items-center justify-between p-3 text-small">
              <span className="text-muted">{t("bus.baseFare")}</span>
              <span className="font-medium font-tabular text-fg">
                {formatMoney(fareData.basePaise, locale)}
              </span>
            </div>
            {fareData.reservationFeePaise > 0 && (
              <div className="flex items-center justify-between p-3 text-small">
                <span className="text-muted">{t("bus.reservationFee")}</span>
                <span className="font-medium font-tabular text-fg">
                  {formatMoney(fareData.reservationFeePaise, locale)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between p-3 text-body font-semibold bg-surface-raised">
              <span>{t("bus.totalFare")}</span>
              <span className="font-tabular text-fg">
                {formatMoney(fareData.totalPaise, locale)}
              </span>
            </div>
          </div>

          {fareData.refundTiers && fareData.refundTiers.length > 0 && (
            <div className="mt-2 flex flex-col gap-2 rounded-md bg-surface p-3 border border-default text-caption text-muted">
              <span className="font-semibold text-fg flex items-center gap-1.5">
                <Info className="size-3.5 text-muted" aria-hidden="true" />
                {t("bus.cancellationPolicy")}
              </span>
              <ul className="list-disc list-inside space-y-1">
                {fareData.refundTiers.map((tier, idx, tiers) => {
                  const above = tiers[idx - 1];
                  return (
                    <li key={tier.minHoursBefore}>
                      {tier.minHoursBefore > 0 || !above
                        ? t("bus.refundTier", { hours: tier.minHoursBefore, percent: tier.percent })
                        : t("bus.refundTierLess", { hours: above.minHoursBefore, percent: tier.percent })}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Card>
      )}

      {/* Boarding and Dropping Points */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Boarding Points */}
        <Card padding="md" className="flex flex-col gap-3">
          <h2 className="text-body font-semibold text-fg flex items-center gap-2">
            <MapPin className="size-4 text-status-success" aria-hidden="true" />
            {t("bus.boardingPoints")}
          </h2>
          <div className="flex flex-col gap-2">
            {trip.boardingPoints.map((bp) => {
              const name = locale === "te" ? bp.nameTe : bp.nameEn;
              const depTime = formatTime(bp.departureAt, locale);
              return (
                <div
                  key={bp.stopId}
                  className="flex items-center justify-between p-2.5 rounded-md bg-surface border border-default"
                >
                  <div className="flex flex-col">
                    <span className="text-small font-medium text-fg">{name}</span>
                    <span className="text-caption text-muted">
                      {formatDistance(bp.kmFromOrigin, locale)}
                    </span>
                  </div>
                  <span className="text-small font-semibold font-tabular text-fg">
                    {depTime}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Dropping Points */}
        <Card padding="md" className="flex flex-col gap-3">
          <h2 className="text-body font-semibold text-fg flex items-center gap-2">
            <MapPin className="size-4 text-status-danger" aria-hidden="true" />
            {t("bus.droppingPoints")}
          </h2>
          <div className="flex flex-col gap-2">
            {trip.droppingPoints.map((dp) => {
              const name = locale === "te" ? dp.nameTe : dp.nameEn;
              const arrTime = formatTime(dp.arrivalAt, locale);
              return (
                <div
                  key={dp.stopId}
                  className="flex items-center justify-between p-2.5 rounded-md bg-surface border border-default"
                >
                  <div className="flex flex-col">
                    <span className="text-small font-medium text-fg">{name}</span>
                    <span className="text-caption text-muted">
                      {formatDistance(dp.kmFromOrigin, locale)}
                    </span>
                  </div>
                  <span className="text-small font-semibold font-tabular text-fg">
                    {arrTime}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Stops Timeline (Compact Vertical List) */}
      <Card padding="md" className="flex flex-col gap-4">
        <h2 className="text-body font-semibold text-fg flex items-center gap-2">
          <Clock className="size-4 text-muted" aria-hidden="true" />
          {t("bus.stopsTimeline")} ({trip.stops.length})
        </h2>

        <div className="relative pl-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-default space-y-4">
          {trip.stops.map((stop, index) => {
            const isFirst = index === 0;
            const isLast = index === trip.stops.length - 1;
            const name = locale === "te" ? stop.nameTe : stop.nameEn;
            const time = formatTime(
              isLast ? stop.scheduledArrivalAt : stop.scheduledDepartureAt,
              locale
            );

            return (
              <div key={stop.stopId} className="relative flex items-start justify-between gap-3">
                {/* Node dot */}
                <span
                  className={`absolute -left-6 top-1.5 size-3 rounded-full border-2 bg-surface ${
                    isFirst
                      ? "border-primary bg-primary"
                      : isLast
                      ? "border-status-danger bg-status-danger"
                      : "border-muted"
                  }`}
                  aria-hidden="true"
                />

                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-small font-medium text-fg truncate">
                      {name}
                    </span>
                    {stop.isBoarding && (
                      <span className="text-caption px-1.5 py-0.5 rounded-sm bg-surface-raised text-muted border border-default">
                        {t("common.boardingPoint")}
                      </span>
                    )}
                  </div>
                  <span className="text-caption text-muted">
                    {formatDistance(stop.kmFromOrigin, locale)}
                    {stop.minutesFromOrigin > 0 && ` · +${formatDuration(stop.minutesFromOrigin, locale)}`}
                  </span>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-small font-semibold font-tabular text-fg">
                    {time}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
