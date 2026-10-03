"use client";

import {
  BOOKING_MAX_PASSENGERS,
  FareDto,
  formatMoney,
  formatTime,
  SeatMapDto,
  TripDetailDto,
} from "@aptransit/shared";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  SeatMap,
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
import { useBookingDraft } from "../../../../lib/booking-draft";
import { queryKeys } from "../../../../lib/query-keys";
import { BookingStepper } from "./booking-stepper";

const SEATS_POLL_MS = 15_000;

export function SeatStep({
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

  const tripQuery = useQuery({
    queryKey: queryKeys.trip(tripId),
    queryFn: ({ signal }) => api(`/trips/${tripId}`, { schema: TripDetailDto, signal }),
  });
  const seatsQuery = useQuery({
    queryKey: queryKeys.tripSeats(tripId),
    queryFn: ({ signal }) => api(`/trips/${tripId}/seats`, { schema: SeatMapDto, signal }),
    // Newly taken seats show up without a reload
    refetchInterval: SEATS_POLL_MS,
  });

  const trip = tripQuery.data;
  const boardingPoints = trip?.boardingPoints ?? [];
  const boarding =
    boardingPoints.find((p) => p.stopId === (boardingPick ?? draft?.from ?? initialFrom)) ??
    boardingPoints[0];
  // Only destinations after the boarding point
  const droppingPoints = (trip?.droppingPoints ?? []).filter(
    (p) => !boarding || p.seq > boarding.seq,
  );
  const dropping =
    droppingPoints.find((p) => p.stopId === (droppingPick ?? draft?.to ?? initialTo)) ??
    droppingPoints.at(-1);

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

  if (tripQuery.isLoading || seatsQuery.isLoading || !draft) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <span className="sr-only" role="status">
          {t("common.loading")}
        </span>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    );
  }

  const failed = tripQuery.error ?? seatsQuery.error;
  if (failed || !trip || !seatsQuery.data) {
    return (
      <ErrorState
        title={t("book.seat.errorTitle")}
        message={t(errorKey(failed, (k) => t.has(k)))}
        retryLabel={t("common.retry")}
        onRetry={() => {
          void tripQuery.refetch();
          void seatsQuery.refetch();
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

  // Seats our own open booking holds count as ours (coming back from step 2 or 3).
  // Seats picked earlier that someone else took since (polling) drop out of the selection.
  const ownHeld = new Set(draft.bookingId ? draft.seats : []);
  const seatStates = seatsQuery.data.seats.map((s) =>
    s.state === "HELD" && ownHeld.has(s.seatNo) ? { ...s, state: "FREE" as const } : s,
  );
  const stateOf = new Map(seatStates.map((s) => [s.seatNo, s.state]));
  const selected = draft.seats.filter((seatNo) => stateOf.get(seatNo) === "FREE");
  const lost = draft.seats.filter((seatNo) => stateOf.get(seatNo) !== "FREE");

  const toggle = (seatNo: string) =>
    updateDraft((d) => {
      const current = d.seats.filter((s) => stateOf.get(s) === "FREE");
      if (current.includes(seatNo)) {
        return { ...d, seats: current.filter((s) => s !== seatNo), takenSeat: undefined };
      }
      // Details typed for a seat that was lost move to the new seat, so nobody types them twice
      const passengers = { ...d.passengers };
      const orphan = Object.keys(passengers).find((s) => !current.includes(s));
      if (orphan && !passengers[seatNo]) {
        passengers[seatNo] = passengers[orphan]!;
        delete passengers[orphan];
      }
      return { ...d, seats: [...current, seatNo], passengers, takenSeat: undefined };
    });

  const fare = fareQuery.data;
  const total = fare && selected.length > 0 ? fare.totalPaise * selected.length : undefined;
  const canContinue = selected.length > 0 && Boolean(boarding && dropping);
  const name = (p: { nameEn: string; nameTe: string }) => (locale === "te" ? p.nameTe : p.nameEn);

  const onContinue = () => {
    if (!canContinue || !boarding || !dropping) return;
    const previous = draft.bookingId;
    updateDraft((d) => {
      // A new segment or seat set means a new booking
      const changed =
        d.from !== boarding.stopId ||
        d.to !== dropping.stopId ||
        d.seats.join() !== selected.join();
      return {
        ...d,
        from: boarding.stopId,
        to: dropping.stopId,
        seats: selected,
        takenSeat: undefined,
        ...(changed ? { bookingId: undefined, bookedSnapshot: undefined } : {}),
      };
    });
    // A changed choice gives the old hold back right away instead of waiting for it to expire
    const stillSame =
      draft.from === boarding.stopId &&
      draft.to === dropping.stopId &&
      draft.seats.join() === selected.join();
    if (previous && !stillSame) {
      void api(`/bookings/${previous}`, { method: "DELETE" }).catch(() => undefined);
    }
    router.push(`/book/${tripId}/details`);
  };

  return (
    <div className="flex flex-col gap-6">
      <BookingStepper current={0} />
      <h1 className="text-h1 text-fg">{t("book.seat.heading")}</h1>

      {draft.takenSeat && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-status-danger-soft bg-status-danger-soft p-3 text-small text-status-danger"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t("errors.SEAT_TAKEN", { seat: draft.takenSeat })}
        </p>
      )}
      {lost.length > 0 && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-status-warning-soft bg-status-warning-soft p-3 text-small text-status-warning"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t("book.seat.lostSeat", { seat: lost.join(", ") })}
        </p>
      )}

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

      <SeatMap
        layout={seatsQuery.data.layout}
        seats={seatStates}
        selected={selected}
        onToggle={toggle}
        maxSelectable={BOOKING_MAX_PASSENGERS}
        labels={{
          map: t("book.seat.map"),
          driver: t("book.seat.driver"),
          legend: t("book.seat.legend"),
          states: {
            FREE: t("book.seat.states.FREE"),
            SELECTED: t("book.seat.states.SELECTED"),
            TAKEN: t("book.seat.states.TAKEN"),
            HELD: t("book.seat.states.HELD"),
            BLOCKED: t("book.seat.states.BLOCKED"),
          },
          seat: (seat, state) => t("book.seat.seatLabel", { seat, state }),
        }}
      />
      {selected.length >= BOOKING_MAX_PASSENGERS && (
        <p className="text-center text-small text-muted" role="status">
          {t("book.seat.maxReached", { max: BOOKING_MAX_PASSENGERS })}
        </p>
      )}

      {/* Sticky fare bar, above the phone bottom nav */}
      <div className="sticky bottom-16 z-sticky -mx-gutter border-t border-default bg-surface-raised px-gutter py-3 md:bottom-0 md:mx-0 md:rounded-lg md:border">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-small text-muted" aria-live="polite">
              {t("book.seat.selected", { count: selected.length, seats: selected.join(", ") })}
            </p>
            {total !== undefined && (
              <p className="text-h3 font-tabular text-fg">
                <span className="sr-only">{t("book.seat.total")}: </span>
                {formatMoney(total, locale)}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <Button
              size="lg"
              onClick={onContinue}
              aria-disabled={!canContinue}
              aria-describedby={canContinue ? undefined : reasonId}
              className={canContinue ? undefined : "opacity-50"}
            >
              {t("book.seat.continue")}
            </Button>
            {!canContinue && (
              <p id={reasonId} className="text-caption text-muted">
                {t("book.seat.pickSeatReason")}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
