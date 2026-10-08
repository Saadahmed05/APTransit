"use client";

import {
  BookingDto,
  FareDto,
  formatDate,
  formatMoney,
  formatTime,
  TripDetailDto,
} from "@aptransit/shared";
import { Button, Card, cn, EmptyState, ErrorState, Skeleton } from "@aptransit/ui";
import { useQuery } from "@tanstack/react-query";
import { CircleCheck, Clock, Info, Ticket, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, errorKey } from "../../../../../lib/api";
import { clearDraft, writeDraft } from "../../../../../lib/booking-draft";
import { usePayment } from "../../../../../lib/payments";
import { queryKeys } from "../../../../../lib/query-keys";
import { BookingStepper } from "../booking-stepper";

const WARN_BELOW_SEC = 120;

/** Seconds left until the given time, ticking once a second. */
function useSecondsLeft(until: string | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [until]);
  if (!until) return null;
  return Math.max(0, Math.floor((new Date(until).getTime() - now) / 1_000));
}

export function ReviewStep({ tripId, bookingId }: { tripId: string; bookingId?: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(false);
  const payment = usePayment();

  const bookingQuery = useQuery({
    queryKey: queryKeys.booking(bookingId ?? ""),
    queryFn: ({ signal }) => api(`/bookings/${bookingId}`, { schema: BookingDto, signal }),
    enabled: Boolean(bookingId),
  });
  const booking = bookingQuery.data;
  const tripQuery = useQuery({
    queryKey: queryKeys.trip(tripId),
    queryFn: ({ signal }) => api(`/trips/${tripId}`, { schema: TripDetailDto, signal }),
  });
  const fareQuery = useQuery({
    queryKey: queryKeys.tripFare(
      tripId,
      booking?.boardingStopId ?? "",
      booking?.droppingStopId ?? "",
    ),
    queryFn: ({ signal }) =>
      api(`/trips/${tripId}/fare`, {
        query: { from: booking?.boardingStopId, to: booking?.droppingStopId },
        schema: FareDto,
        signal,
      }),
    enabled: Boolean(booking),
  });
  const secondsLeft = useSecondsLeft(
    booking?.status === "PENDING_PAYMENT" ? booking.holdExpiresAt : undefined,
  );

  const pickAgain = () => {
    writeDraft(tripId, (d) => ({ ...d, bookingId: undefined, bookedSnapshot: undefined }));
    router.push(`/book/${tripId}`);
  };

  if (!bookingId) return <MissingBooking tripId={tripId} />;

  if (bookingQuery.isLoading || tripQuery.isLoading) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <span className="sr-only" role="status">
          {t("common.loading")}
        </span>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  const failed = bookingQuery.error ?? tripQuery.error;
  if (failed || !booking || !tripQuery.data) {
    return (
      <ErrorState
        title={t("book.review.errorTitle")}
        message={t(errorKey(failed, (k) => t.has(k)))}
        retryLabel={t("common.retry")}
        onRetry={() => {
          void bookingQuery.refetch();
          void tripQuery.refetch();
        }}
      />
    );
  }

  if (booking.status === "CONFIRMED") {
    return (
      <EmptyState
        headingLevel="h1"
        icon={CircleCheck}
        title={t("book.review.paidTitle")}
        hint={t("book.review.paidHint")}
        action={
          <Link href="/tickets" className="text-body font-medium text-primary underline">
            {t("nav.tickets")}
          </Link>
        }
      />
    );
  }

  const expired = booking.status !== "PENDING_PAYMENT" || secondsLeft === 0;
  const trip = tripQuery.data;
  const boarding = trip.boardingPoints.find((p) => p.stopId === booking.boardingStopId);
  const dropping = trip.droppingPoints.find((p) => p.stopId === booking.droppingStopId);
  const name = (p: { nameEn: string; nameTe: string } | undefined) =>
    p ? (locale === "te" ? p.nameTe : p.nameEn) : "";
  const serviceKey = `serviceType.${trip.busType.serviceType}`;
  const fare = fareQuery.data;
  const total = formatMoney(booking.totalPaise, locale);

  const onPay = () =>
    payment.pay({
      bookingId: booking.id,
      name: t("common.appName"),
      description: t("book.review.paymentDescription", {
        route: t("common.routeFromTo", { from: name(boarding), to: name(dropping) }),
        date: formatDate(new Date(`${trip.serviceDate}T00:00:00.000Z`), locale),
      }),
      onConfirmed: (id) => {
        clearDraft(tripId);
        router.push(`/book/done/${id}`);
      },
    });
  const paying = payment.state.phase === "working" || payment.state.phase === "checking";

  const onCancel = async () => {
    setCancelling(true);
    setCancelError(false);
    try {
      await api(`/bookings/${booking.id}`, { method: "DELETE" });
      clearDraft(tripId);
      router.push(
        `/bus/${tripId}?${new URLSearchParams({ from: booking.boardingStopId, to: booking.droppingStopId }).toString()}`,
      );
    } catch {
      setCancelError(true);
      setCancelling(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <BookingStepper current={2} />
      <h1 className="text-h1 text-fg">{t("book.review.heading")}</h1>

      {expired ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-lg border border-status-danger-soft bg-status-danger-soft p-4"
        >
          <p className="flex items-start gap-2 text-body font-semibold text-status-danger">
            <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            {t("errors.HOLD_EXPIRED")}
          </p>
          <Button onClick={pickAgain}>{t("book.review.pickAgain")}</Button>
        </div>
      ) : (
        <HoldTimer secondsLeft={secondsLeft ?? 0} />
      )}

      <Card padding="md" className="flex flex-col gap-3">
        <h2 className="text-h3 text-fg">{t("book.review.trip")}</h2>
        <p className="text-body font-semibold text-fg">
          {t.has(serviceKey) ? t(serviceKey) : trip.busType.nameEn}
          <span className="font-normal text-muted">
            {" "}
            · {formatDate(new Date(`${trip.serviceDate}T00:00:00.000Z`), locale)}
          </span>
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="text-caption text-muted">{t("common.boardingPoint")}</p>
            <p className="break-words text-body text-fg">{name(boarding)}</p>
            {boarding && (
              <p className="text-h3 tabular-nums text-fg">
                {formatTime(boarding.departureAt, locale)}
              </p>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-caption text-muted">{t("common.destination")}</p>
            <p className="break-words text-body text-fg">{name(dropping)}</p>
            {dropping && (
              <p className="text-h3 tabular-nums text-fg">
                {formatTime(dropping.arrivalAt, locale)}{" "}
                <span className="text-caption font-normal text-muted">({t("bus.approx")})</span>
              </p>
            )}
          </div>
        </div>
      </Card>

      <Card padding="md" className="flex flex-col gap-3">
        <h2 className="text-h3 text-fg">{t("book.review.passengers")}</h2>
        <ul className="divide-y divide-default">
          {booking.passengers.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 break-words text-body text-fg">
                {t("book.review.passengerLine", { name: p.name, age: p.age })}
              </span>
              <span className="shrink-0 text-small font-medium text-muted">
                {t("book.review.seat", { seat: p.seatNo })}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {fare && (
        <Card padding="md" className="flex flex-col gap-3">
          <h2 className="text-h3 text-fg">{t("bus.fareBreakdown")}</h2>
          <dl className="divide-y divide-default rounded-md border border-default">
            <div className="flex justify-between gap-3 p-3 text-small">
              <dt className="text-muted">{t("bus.baseFare")}</dt>
              <dd className="tabular-nums text-fg">{formatMoney(fare.basePaise, locale)}</dd>
            </div>
            {fare.reservationFeePaise > 0 && (
              <div className="flex justify-between gap-3 p-3 text-small">
                <dt className="text-muted">{t("bus.reservationFee")}</dt>
                <dd className="tabular-nums text-fg">
                  {formatMoney(fare.reservationFeePaise, locale)}
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-3 p-3 text-small">
              <dt className="text-muted">
                {t("book.review.perPassenger", {
                  count: booking.passengers.length,
                  fare: formatMoney(fare.totalPaise, locale),
                })}
              </dt>
              <dd className="tabular-nums text-body font-semibold text-fg">{total}</dd>
            </div>
          </dl>
          <div className="flex flex-col gap-1 text-small text-muted">
            <p className="font-semibold text-fg">{t("bus.cancellationPolicy")}</p>
            <ul className="list-inside list-disc space-y-1">
              {fare.refundTiers.map((tier, i, tiers) => {
                const above = tiers[i - 1];
                return (
                  <li key={tier.minHoursBefore}>
                    {tier.minHoursBefore > 0 || !above
                      ? t("bus.refundTier", { hours: tier.minHoursBefore, percent: tier.percent })
                      : t("bus.refundTierLess", {
                          hours: above.minHoursBefore,
                          percent: tier.percent,
                        })}
                  </li>
                );
              })}
            </ul>
          </div>
        </Card>
      )}

      {payment.state.phase === "dismissed" && (
        <p role="status" className="flex items-start gap-2 rounded-md border border-default bg-surface p-3 text-small text-muted">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t("book.review.payNotCompleted")}
        </p>
      )}
      {(payment.state.phase === "failed" || payment.state.phase === "blocked") && (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-status-danger-soft bg-status-danger-soft p-3 text-small text-status-danger">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {payment.state.phase === "blocked"
            ? t("book.review.payBlocked")
            : t(payment.state.errorKey && t.has(payment.state.errorKey) ? payment.state.errorKey : "book.review.payFailed")}
        </p>
      )}
      {payment.state.phase === "checking" && (
        <div role="status" className="flex flex-col gap-1 rounded-md border border-status-info-soft bg-status-info-soft p-3 text-small text-status-info">
          <p className="font-semibold">{t("book.review.checkingTitle")}</p>
          <p>{t("book.review.checkingHint", { code: booking.code })}</p>
        </div>
      )}

      {cancelError && (
        <p role="alert" className="text-small text-status-danger">
          {t("book.review.cancelFailed")}
        </p>
      )}

      <div className="sticky bottom-16 z-sticky -mx-gutter flex flex-wrap items-center justify-between gap-3 border-t border-default bg-surface-raised px-gutter py-3 md:bottom-0 md:mx-0 md:rounded-lg md:border">
        {expired ? (
          <span />
        ) : (
          <Button variant="ghost" onClick={onCancel} loading={cancelling} disabled={paying}>
            {t("book.review.cancel")}
          </Button>
        )}
        <Button
          size="lg"
          onClick={onPay}
          disabled={expired}
          loading={paying}
          leftIcon={<Ticket className="size-5" aria-hidden="true" />}
        >
          {t("book.review.pay", { amount: total })}
        </Button>
      </div>
    </div>
  );
}

/** mm:ss, warning tone under 2 minutes. Screen readers hear it at 5, 2 and 1 minutes only. */
function HoldTimer({ secondsLeft }: { secondsLeft: number }) {
  const t = useTranslations("book.review");
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const warn = secondsLeft < WARN_BELOW_SEC;
  const milestone = secondsLeft <= 60 ? 1 : secondsLeft <= 120 ? 2 : secondsLeft <= 300 ? 5 : null;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border p-4",
        warn
          ? "border-status-warning-soft bg-status-warning-soft text-status-warning"
          : "border-default bg-surface text-fg",
      )}
    >
      <span className="flex items-center gap-2 text-body font-medium">
        <Clock className="size-5 shrink-0" aria-hidden="true" />
        {t("holdLabel")}
      </span>
      <span role="timer" aria-live="off" className="text-h2 tabular-nums">
        {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
      </span>
      <span className="sr-only" aria-live="polite">
        {milestone ? t("holdLeft", { minutes: milestone }) : ""}
      </span>
    </div>
  );
}

function MissingBooking({ tripId }: { tripId: string }) {
  const t = useTranslations();
  return (
    <EmptyState
      headingLevel="h1"
      icon={TriangleAlert}
      title={t("book.review.closedTitle")}
      action={
        <Link href={`/book/${tripId}`} className="text-body font-medium text-primary underline">
          {t("book.review.pickAgain")}
        </Link>
      }
    />
  );
}
