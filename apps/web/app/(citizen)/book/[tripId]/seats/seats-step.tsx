"use client";

import { FareDto, formatMoney, groupFareByCategory, categoriesFromCounts, SeatMapDto } from "@aptransit/shared";
import { Button, EmptyState, ErrorState, SeatMap, Skeleton } from "@aptransit/ui";
import { useQuery } from "@tanstack/react-query";
import { Armchair, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { api, errorKey } from "../../../../../lib/api";
import { travellerTotal, useBookingDraft } from "../../../../../lib/booking-draft";
import { queryKeys } from "../../../../../lib/query-keys";
import { submitBooking } from "../../../../../lib/submit-booking";
import { BookingStepper } from "../booking-stepper";

const SEATS_POLL_MS = 15_000;

/** D-048 step 2 on reserved trips: exactly one seat per traveller. Seatless trips never get here. */
export function SeatsStep({ tripId }: { tripId: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const reasonId = useId();
  const [draft, updateDraft] = useBookingDraft(tripId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seatsQuery = useQuery({
    queryKey: queryKeys.tripSeats(tripId),
    queryFn: ({ signal }) => api(`/trips/${tripId}/seats`, { schema: SeatMapDto, signal }),
    // Newly taken seats show up without a reload
    refetchInterval: SEATS_POLL_MS,
  });
  const fareQuery = useQuery({
    queryKey: queryKeys.tripFare(tripId, draft?.from ?? "", draft?.to ?? ""),
    queryFn: ({ signal }) =>
      api(`/trips/${tripId}/fare`, { query: { from: draft?.from, to: draft?.to }, schema: FareDto, signal }),
    enabled: Boolean(draft?.from && draft?.to),
  });

  // A local trip has no seats: send it back to the travellers step, which books it directly
  const seatless = fareQuery.data?.seatless === true;
  useEffect(() => {
    if (seatless) router.replace(`/book/${tripId}`);
  }, [seatless, router, tripId]);

  const backHref = `/book/${tripId}?${new URLSearchParams({ from: draft?.from ?? "", to: draft?.to ?? "" }).toString()}`;

  if (!draft || seatsQuery.isLoading || fareQuery.isLoading || seatless) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <span className="sr-only" role="status">
          {t("common.loading")}
        </span>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    );
  }

  const count = travellerTotal(draft.counts);
  if (count === 0 || !draft.from || !draft.to) {
    return (
      <EmptyState
        headingLevel="h1"
        icon={Armchair}
        title={t("book.seats.noTravellers")}
        action={
          <Link href={backHref} className="text-body font-medium text-primary underline">
            {t("book.seats.changeTravellers")}
          </Link>
        }
      />
    );
  }

  if (seatsQuery.error || !seatsQuery.data) {
    return (
      <ErrorState
        title={t("book.seat.errorTitle")}
        message={t(errorKey(seatsQuery.error, (k) => t.has(k)))}
        retryLabel={t("common.retry")}
        onRetry={() => void seatsQuery.refetch()}
      />
    );
  }

  // Seats our own open booking holds count as ours (coming back from review)
  const ownHeld = new Set(draft.bookingId ? draft.seats : []);
  const seatStates = seatsQuery.data.seats.map((s) =>
    s.state === "HELD" && ownHeld.has(s.seatNo) ? { ...s, state: "FREE" as const } : s,
  );
  const stateOf = new Map(seatStates.map((s) => [s.seatNo, s.state]));
  const selected = draft.seats.filter((seatNo) => stateOf.get(seatNo) === "FREE").slice(0, count);
  const lost = draft.seats.filter((seatNo) => stateOf.get(seatNo) !== "FREE");

  const toggle = (seatNo: string) =>
    updateDraft((d) => {
      const current = d.seats.filter((s) => stateOf.get(s) === "FREE").slice(0, count);
      if (current.includes(seatNo)) return { ...d, seats: current.filter((s) => s !== seatNo), takenSeat: undefined };
      if (current.length >= count) return d;
      return { ...d, seats: [...current, seatNo], takenSeat: undefined };
    });

  const fare = fareQuery.data;
  const total = fare ? groupFareByCategory(fare.totalPaise, categoriesFromCounts(draft.counts)).totalPaise : undefined;
  const canContinue = selected.length === count && !busy;

  const onContinue = async () => {
    if (!canContinue) return;
    updateDraft((d) => ({ ...d, seats: selected }));
    setBusy(true);
    setError(null);
    const result = await submitBooking(tripId, { withSeats: true });
    if (result.kind === "booked") {
      router.push(`/book/${tripId}/review?booking=${result.bookingId}`);
      return;
    }
    setBusy(false);
    if (result.kind === "seatTaken") {
      void seatsQuery.refetch();
      return;
    }
    setError(t(errorKey(result.error, (k) => t.has(k))));
  };

  return (
    <div className="flex flex-col gap-6">
      <BookingStepper current="seats" seatless={false} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-h1 text-fg">{t("book.seats.heading", { count })}</h1>
        <Link href={backHref} className="inline-flex min-h-11 items-center text-small font-medium text-primary underline">
          {t("book.seats.changeTravellers")}
        </Link>
      </div>

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

      <SeatMap
        layout={seatsQuery.data.layout}
        seats={seatStates}
        selected={selected}
        onToggle={toggle}
        maxSelectable={count}
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

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-status-danger-soft bg-status-danger-soft p-3 text-small text-status-danger"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      <div className="sticky bottom-16 z-sticky -mx-gutter border-t border-default bg-surface-raised px-gutter py-3 md:bottom-0 md:mx-0 md:rounded-lg md:border">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-small text-muted" aria-live="polite">
              {t("book.seats.picked", { picked: selected.length, count })}
            </p>
            {total !== undefined && (
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
              {t("book.seat.continue")}
            </Button>
            {selected.length !== count && (
              <p id={reasonId} className="text-caption text-muted">
                {t("book.seats.needExact", { count })}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
