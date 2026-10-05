"use client";

import { BookingDto, CreateBookingPassengerInput, PassDto, SeatMapDto, TripDetailDto } from "@aptransit/shared";
import { Button, Card, EmptyState, ErrorState, Field, Input, RadioGroup, RadioGroupItem, SeatMap, Skeleton } from "@aptransit/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, HeartHandshake } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { z } from "zod";
import { useMe } from "../../../../../components/auth-provider";
import { api, errorKey, isApiError } from "../../../../../lib/api";
import { queryKeys } from "../../../../../lib/query-keys";
import { useNow } from "../../../../../lib/use-browser-state";

const PassList = z.array(PassDto);
const GENDERS = ["F", "M", "X"] as const;
const SEATS_POLL_MS = 15_000;

type Errors = Partial<Record<"seat" | "name" | "age" | "gender", string>>;

export function FreeSeatView({ tripId, initialFrom, initialTo }: { tripId: string; initialFrom?: string; initialTo?: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const now = useNow(60_000);
  const me = useMe();
  const [seat, setSeat] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  const tripQuery = useQuery({
    queryKey: queryKeys.trip(tripId),
    queryFn: ({ signal }) => api(`/trips/${tripId}`, { schema: TripDetailDto, signal }),
  });
  const trip = tripQuery.data;
  const boarding = trip?.boardingPoints.find((p) => p.stopId === initialFrom) ?? trip?.boardingPoints[0];
  const dropping = trip?.droppingPoints.find((p) => p.stopId === initialTo) ?? trip?.droppingPoints.at(-1);
  const seatsQuery = useQuery({
    queryKey: queryKeys.tripSeats(tripId, boarding?.stopId, dropping?.stopId),
    queryFn: ({ signal }) => api(`/trips/${tripId}/seats`, { query: { from: boarding?.stopId, to: dropping?.stopId }, schema: SeatMapDto, signal }),
    enabled: Boolean(boarding && dropping),
    refetchInterval: SEATS_POLL_MS,
  });
  const passesQuery = useQuery({
    queryKey: queryKeys.passes,
    queryFn: ({ signal }) => api("/passes", { schema: PassList, signal }),
  });

  const book = useMutation({
    // One Idempotency-Key per attempt: a retried request cannot book twice
    mutationFn: ({ passenger, key }: { passenger: CreateBookingPassengerInput; key: string }) =>
      api("/bookings", {
        method: "POST",
        body: { tripId, boardingStopId: boarding!.stopId, droppingStopId: dropping!.stopId, passengers: [passenger], useFreeTravel: true },
        headers: { "Idempotency-Key": key },
        schema: BookingDto,
      }),
    onSuccess: (booking) => {
      void queryClient.invalidateQueries({ queryKey: ["tickets"] });
      router.push(`/book/done/${booking.id}`);
    },
    onError: (error) => {
      if (isApiError(error) && error.code === "SEAT_TAKEN") {
        setSeat(null);
        void seatsQuery.refetch();
      }
    },
  });

  const back = (
    <Button asChild variant="ghost">
      <Link href={`/bus/${tripId}${initialFrom && initialTo ? `?${new URLSearchParams({ from: initialFrom, to: initialTo })}` : ""}`}>
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("common.back")}
      </Link>
    </Button>
  );

  if (tripQuery.isLoading || passesQuery.isLoading || (Boolean(boarding && dropping) && seatsQuery.isLoading)) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4" aria-busy="true">
        <span className="sr-only" role="status">
          {t("common.loading")}
        </span>
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-80 w-full rounded-lg" />
      </div>
    );
  }
  const failed = tripQuery.error ?? passesQuery.error ?? seatsQuery.error;
  if (failed || !trip || !seatsQuery.data) {
    return (
      <ErrorState
        headingLevel="h1"
        title={t("freeSeat.errorTitle")}
        message={t(errorKey(failed, (k) => t.has(k)))}
        retryLabel={t("common.retry")}
        onRetry={() => {
          void tripQuery.refetch();
          void passesQuery.refetch();
          void seatsQuery.refetch();
        }}
      />
    );
  }

  const freePass = (passesQuery.data ?? []).find(
    (p) => p.kind === "FREE_TRAVEL" && p.status === "ACTIVE" && p.validUntil !== null && now > 0 && Date.parse(p.validUntil) > now,
  );
  const covered = trip.freeTravelEligible && (!freePass || freePass.eligibleServiceTypes.includes(trip.busType.serviceType));
  if (!covered) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col items-start gap-4">
        {back}
        <EmptyState headingLevel="h1" icon={HeartHandshake} title={t("freeSeat.notOnThisBus")} className="w-full" />
      </div>
    );
  }
  if (!freePass) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col items-start gap-4">
        {back}
        <EmptyState
          headingLevel="h1"
          icon={HeartHandshake}
          title={t("freeSeat.needPassTitle")}
          hint={t("freeSeat.needPassHint")}
          className="w-full"
          action={
            <Button asChild>
              <Link href="/free-travel">{t("freeSeat.getPass")}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const pick = (p: { nameEn: string; nameTe: string }) => (locale === "te" ? p.nameTe : p.nameEn);
  const typedName = name ?? me.data?.name ?? "";
  const seatStates = seatsQuery.data.seats;
  const selected = seat && seatStates.some((s) => s.seatNo === seat && s.state === "FREE") ? [seat] : [];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = CreateBookingPassengerInput.safeParse({ name: typedName.trim(), age: Number(age), gender, seatNo: selected[0] ?? "" });
    const next: Errors = {};
    if (selected.length === 0) next.seat = t("freeSeat.pickSeat");
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === "name") next.name = t("book.details.errors.name");
        if (field === "age") next.age = t("book.details.errors.age");
        if (field === "gender") next.gender = t("book.details.errors.gender");
      }
    }
    setErrors(next);
    if (Object.keys(next).length > 0 || !parsed.success) return;
    book.mutate({ passenger: parsed.data, key: crypto.randomUUID() });
  };

  const bookError =
    book.error && isApiError(book.error) && book.error.code === "SEAT_TAKEN"
      ? t("errors.SEAT_TAKEN", { seat: String(book.error.details?.seatNo ?? "") })
      : book.error
        ? t(errorKey(book.error, (k) => t.has(k)))
        : null;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <div>{back}</div>
      <h1 className="text-h1 text-fg">{t("freeSeat.title")}</h1>
      <p className="text-body text-muted">{t("freeSeat.intro")}</p>
      <Card padding="md" className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body font-medium text-fg">
          {boarding && dropping ? t("freeSeat.segment", { from: pick(boarding), to: pick(dropping) }) : ""}
        </p>
        <p className="text-body font-semibold text-status-success">{t("freeSeat.freeFare")}</p>
      </Card>

      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <section aria-labelledby="free-seat-heading" className="flex flex-col gap-3">
          <h2 id="free-seat-heading" className="text-h2 text-fg">
            {t("freeSeat.seatHeading")}
          </h2>
          <SeatMap
            layout={seatsQuery.data.layout}
            seats={seatStates}
            selected={selected}
            onToggle={(seatNo) => setSeat((current) => (current === seatNo ? null : seatNo))}
            maxSelectable={1}
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
              seat: (seatNo, state) => t("book.seat.seatLabel", { seat: seatNo, state }),
            }}
          />
          {errors.seat && (
            <p role="alert" className="text-small text-status-danger">
              {errors.seat}
            </p>
          )}
        </section>

        <Card padding="md" className="flex flex-col gap-4">
          <h2 className="text-h3 text-fg">{t("freeSeat.passengerHeading")}</h2>
          <Field id="free-name" label={t("book.details.name")} required error={errors.name}>
            <Input id="free-name" autoComplete="name" value={typedName} onChange={(e) => setName(e.target.value)} aria-invalid={errors.name ? true : undefined} />
          </Field>
          <Field id="free-age" label={t("book.details.age")} required error={errors.age}>
            <Input id="free-age" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))} aria-invalid={errors.age ? true : undefined} />
          </Field>
          <fieldset className="flex flex-col gap-2">
            <legend id="free-gender-label" className="text-body font-medium text-fg">
              {t("book.details.gender")}
            </legend>
            <RadioGroup value={gender} onValueChange={setGender} aria-labelledby="free-gender-label" className="flex flex-wrap gap-2">
              {GENDERS.map((value) => (
                <label key={value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-strong px-3 has-[[data-state=checked]]:border-primary">
                  <RadioGroupItem value={value} isError={Boolean(errors.gender)} aria-labelledby={`free-gender-${value}`} />
                  <span id={`free-gender-${value}`} className="text-body text-fg">
                    {t(`book.details.genders.${value}`)}
                  </span>
                </label>
              ))}
            </RadioGroup>
            {errors.gender && <p className="text-small text-status-danger">{errors.gender}</p>}
          </fieldset>
        </Card>

        {bookError && (
          <p role="alert" className="text-small text-status-danger">
            {bookError}
          </p>
        )}
        <Button type="submit" size="lg" loading={book.isPending}>
          {t("freeSeat.book")}
        </Button>
      </form>
    </div>
  );
}
