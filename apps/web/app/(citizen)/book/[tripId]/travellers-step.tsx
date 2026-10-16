"use client";

import { FareDto, formatMoney, formatTime, groupFareByCategory, categoriesFromCounts, TripDetailDto } from "@aptransit/shared";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from "@aptransit/ui";
import { useQuery } from "@tanstack/react-query";
import { Ban, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { api, errorKey } from "../../../../lib/api";
import { travellerTotal, useBookingDraft } from "../../../../lib/booking-draft";
import { queryKeys } from "../../../../lib/query-keys";
import { submitBooking } from "../../../../lib/submit-booking";
import { BookingStepper } from "./booking-stepper";
import { TravellerCounts } from "./traveller-counts";

/**
 * D-048 step 1: where you board and get down, and how many adults, children and seniors.
 * Local (seatless) trips book right here and go to payment: no seat map ever shows for them.
 * Reserved trips continue to the seats step with exactly that many seats to pick.
 */
export function TravellersStep({
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
  const reasonId = useId();
  const [draft, updateDraft] = useBookingDraft(tripId);
  const [boardingPick, setBoardingPick] = useState<string>();
  const [droppingPick, setDroppingPick] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tripQuery = useQuery({
    queryKey: queryKeys.trip(tripId),
    queryFn: ({ signal }) => api(`/trips/${tripId}`, { schema: TripDetailDto, signal }),
  });

  const trip = tripQuery.data;
  const boardingPoints = trip?.boardingPoints ?? [];
  const boarding =
    boardingPoints.find((p) => p.stopId === (boardingPick ?? draft?.from ?? initialFrom)) ?? boardingPoints[0];
  // Only destinations after the boarding point
  const droppingPoints = (trip?.droppingPoints ?? []).filter((p) => !boarding || p.seq > boarding.seq);
  const dropping =
    droppingPoints.find((p) => p.stopId === (droppingPick ?? draft?.to ?? initialTo)) ?? droppingPoints.at(-1);

  const fareQuery = useQuery({
    queryKey: queryKeys.tripFare(tripId, boarding?.stopId ?? "", dropping?.stopId ?? ""),
    queryFn: ({ signal }) =>
      api(`/trips/${tripId}/fare`, {
        query: { from: boarding?.stopId, to: dropping?.stopId },
        schema: FareDto,
        signal,
      }),
    enabled: Boolean(boarding && dropping),
  });

  if (tripQuery.isLoading || fareQuery.isLoading || !draft) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <span className="sr-only" role="status">
          {t("common.loading")}
        </span>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  const failed = tripQuery.error ?? fareQuery.error;
  if (failed || !trip) {
    return (
      <ErrorState
        title={t("book.seat.errorTitle")}
        message={t(errorKey(failed, (k) => t.has(k)))}
        retryLabel={t("common.retry")}
        onRetry={() => {
          void tripQuery.refetch();
          void fareQuery.refetch();
        }}
      />
    );
  }

  if (!trip.bookingOpen) {
    return (
      <EmptyState
        headingLevel="h1"
        icon={Ban}
        title={t("bus.bookingClosed")}
        action={
          <Button variant="secondary" onClick={() => router.push(`/bus/${tripId}`)}>
            {t("common.back")}
          </Button>
        }
      />
    );
  }

  const fare = fareQuery.data;
  const seatless = fare?.seatless ?? trip.seatless;
  const count = travellerTotal(draft.counts);
  const total = fare ? groupFareByCategory(fare.totalPaise, categoriesFromCounts(draft.counts)).totalPaise : undefined;
  const canContinue = count > 0 && Boolean(boarding && dropping) && !busy;
  const name = (p: { nameEn: string; nameTe: string }) => (locale === "te" ? p.nameTe : p.nameEn);

  const keepStops = () => {
    if (!boarding || !dropping) return;
    updateDraft((d) =>
      d.from === boarding.stopId && d.to === dropping.stopId
        ? d
        : { ...d, from: boarding.stopId, to: dropping.stopId, seats: [], takenSeat: undefined },
    );
  };

  const onContinue = async () => {
    if (!canContinue) return;
    keepStops();
    if (!seatless) {
      router.push(`/book/${tripId}/seats`);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await submitBooking(tripId, { withSeats: false });
    if (result.kind === "booked") {
      router.push(`/book/${tripId}/review?booking=${result.bookingId}`);
      return;
    }
    setError(t(errorKey(result.kind === "error" ? result.error : null, (k) => t.has(k))));
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-6" data-testid={seatless ? "local-booking" : "travellers-step"}>
      <BookingStepper current="travellers" seatless={seatless} />
      <h1 className="text-h1 text-fg">{t("book.travellers.heading")}</h1>

      <Card padding="md" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="book-boarding" className="text-small font-medium text-fg">
            {t("book.seat.boarding")}
          </label>
          <Select value={boarding?.stopId} onValueChange={setBoardingPick}>
            <SelectTrigger id="book-boarding">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {boardingPoints.map((p) => (
                <SelectItem key={p.stopId} value={p.stopId}>
                  {name(p)} · {formatTime(p.departureAt, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="book-dropping" className="text-small font-medium text-fg">
            {t("book.seat.dropping")}
          </label>
          <Select value={dropping?.stopId} onValueChange={setDroppingPick}>
            <SelectTrigger id="book-dropping">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {droppingPoints.map((p) => (
                <SelectItem key={p.stopId} value={p.stopId}>
                  {name(p)} · {formatTime(p.arrivalAt, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <TravellerCounts
        counts={draft.counts}
        adultTotalPaise={fare?.totalPaise}
        onChange={(counts) => updateDraft((d) => ({ ...d, counts }))}
      />
      {seatless && <p className="text-small text-muted">{t("book.travellers.noSeat")}</p>}

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-status-danger-soft bg-status-danger-soft p-3 text-small text-status-danger"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {/* Sticky fare bar, above the phone bottom nav */}
      <div className="sticky bottom-16 z-sticky -mx-gutter border-t border-default bg-surface-raised px-gutter py-3 md:bottom-0 md:mx-0 md:rounded-lg md:border">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-small text-muted" aria-live="polite">
              {t("book.travellers.summary", {
                adults: draft.counts.ADULT,
                children: draft.counts.CHILD,
                seniors: draft.counts.SENIOR,
              })}
            </p>
            {total !== undefined && count > 0 && (
              <p className="text-h3 tabular-nums text-fg">
                <span className="sr-only">{t("book.travellers.total")}: </span>
                {formatMoney(total, locale)}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <Button
              size="lg"
              onClick={() => void onContinue()}
              aria-disabled={!canContinue}
              aria-describedby={canContinue ? undefined : reasonId}
              className={canContinue ? undefined : "opacity-50"}
            >
              {seatless ? t("book.travellers.continuePay") : t("book.travellers.chooseSeats", { count })}
            </Button>
            {count === 0 && (
              <p id={reasonId} className="text-caption text-muted">
                {t("book.travellers.none")}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
