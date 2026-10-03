"use client";

import { BookingDto, CreateBookingPassengerInput } from "@aptransit/shared";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  RadioGroup,
  RadioGroupItem,
  Skeleton,
} from "@aptransit/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { Armchair, TriangleAlert, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { useMe } from "../../../../../components/auth-provider";
import { api, errorKey, isApiError } from "../../../../../lib/api";
import {
  type BookingDraft,
  passengerSnapshot,
  useBookingDraft,
  writeDraft,
} from "../../../../../lib/booking-draft";
import { BookingStepper } from "../booking-stepper";

const GENDERS = ["F", "M", "X"] as const;
const PassengersForm = z.object({
  passengers: z.array(CreateBookingPassengerInput.omit({ seatNo: true })),
});
type FormInput = z.input<typeof PassengersForm>;
type FormOutput = z.output<typeof PassengersForm>;

export function DetailsStep({ tripId }: { tripId: string }) {
  const t = useTranslations();
  const [draft] = useBookingDraft(tripId);

  if (!draft) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <span className="sr-only" role="status">
          {t("common.loading")}
        </span>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-56 w-full rounded-lg" />
      </div>
    );
  }

  if (draft.seats.length === 0 || !draft.from || !draft.to) {
    return (
      <EmptyState
        headingLevel="h1"
        icon={Armchair}
        title={t("book.details.noSeats")}
        action={
          <Link href={`/book/${tripId}`} className="text-body font-medium text-primary underline">
            {t("book.details.backToSeats")}
          </Link>
        }
      />
    );
  }

  // Keyed by the seat set, so a new choice on step 1 starts a fresh form
  return <PassengersFormView key={draft.seats.join()} tripId={tripId} draft={draft} />;
}

function PassengersFormView({ tripId, draft }: { tripId: string; draft: BookingDraft }) {
  const t = useTranslations();
  const router = useRouter();
  const me = useMe();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const backToSeats = `/book/${tripId}?${new URLSearchParams({ from: draft.from ?? "", to: draft.to ?? "" }).toString()}`;

  const { control, register, handleSubmit, setValue, subscribe, formState } = useForm<
    FormInput,
    unknown,
    FormOutput
  >({
    resolver: zodResolver(PassengersForm),
    defaultValues: {
      passengers: draft.seats.map((seatNo) => {
        const saved = draft.passengers[seatNo];
        return { name: saved?.name ?? "", age: saved?.age ?? "", gender: saved?.gender };
      }),
    },
  });

  // Every keystroke goes to the draft, so Back and a SEAT_TAKEN round trip keep the names
  useEffect(() => {
    return subscribe({
      formState: { values: true },
      callback: ({ values }) => {
        writeDraft(tripId, (d) => ({
          ...d,
          passengers: Object.fromEntries(
            d.seats.map((seatNo, i) => {
              const v = values.passengers?.[i];
              return [
                seatNo,
                {
                  name: v?.name ?? "",
                  age: (v?.age as string | number | undefined) ?? "",
                  gender: v?.gender,
                },
              ];
            }),
          ),
        }));
      },
    });
  }, [subscribe, tripId]);

  const onSubmit = async (values: FormOutput) => {
    setSubmitError(null);
    const current = writeDraft(tripId, (d) => d);
    const snapshot = passengerSnapshot(current);

    // Back from step 3 without changes: the booking and its hold are still good
    if (current.bookingId && current.bookedSnapshot === snapshot) {
      router.push(`/book/${tripId}/review?booking=${current.bookingId}`);
      return;
    }
    if (current.bookingId) {
      await api(`/bookings/${current.bookingId}`, { method: "DELETE" }).catch(() => undefined);
    }

    try {
      const booking = await api("/bookings", {
        method: "POST",
        // One key per attempt: a network retry of this request cannot create a second booking
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: {
          tripId,
          boardingStopId: current.from,
          droppingStopId: current.to,
          passengers: current.seats.map((seatNo, i) => ({ ...values.passengers[i], seatNo })),
        },
        schema: BookingDto,
      });
      writeDraft(tripId, (d) => ({ ...d, bookingId: booking.id, bookedSnapshot: snapshot }));
      router.push(`/book/${tripId}/review?booking=${booking.id}`);
    } catch (err) {
      if (isApiError(err) && err.code === "SEAT_TAKEN") {
        const seat =
          typeof err.details?.seatNo === "string" ? err.details.seatNo : current.seats[0];
        writeDraft(tripId, (d) => ({
          ...d,
          seats: d.seats.filter((s) => s !== seat),
          takenSeat: seat,
          bookingId: undefined,
          bookedSnapshot: undefined,
        }));
        router.push(backToSeats);
        return;
      }
      setSubmitError(t(errorKey(err, (k) => t.has(k))));
    }
  };

  const errors = formState.errors.passengers;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
      <BookingStepper current={1} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-h1 text-fg">{t("book.details.heading")}</h1>
        <Link
          href={backToSeats}
          className="inline-flex min-h-11 items-center text-small font-medium text-primary underline"
        >
          {t("book.details.backToSeats")}
        </Link>
      </div>

      {draft.seats.map((seatNo, index) => {
        const fieldErrors = errors?.[index];
        const headingId = `passenger-${seatNo}`;
        return (
          <Card
            key={seatNo}
            padding="md"
            className="flex flex-col gap-4"
            role="group"
            aria-labelledby={headingId}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id={headingId} className="text-h3 text-fg">
                {t("book.details.passenger", { number: index + 1, seat: seatNo })}
              </h2>
              {index === 0 && (
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  leftIcon={<UserRound className="size-4" aria-hidden="true" />}
                  disabled={!me.data?.name}
                  onClick={() =>
                    me.data?.name &&
                    setValue("passengers.0.name", me.data.name, { shouldValidate: true })
                  }
                >
                  {t("book.details.useMine")}
                </Button>
              )}
            </div>

            <Field
              id={`name-${seatNo}`}
              label={t("book.details.name")}
              required
              error={fieldErrors?.name ? t("book.details.errors.name") : undefined}
            >
              <Input
                autoComplete={index === 0 ? "name" : "off"}
                {...register(`passengers.${index}.name`)}
              />
            </Field>

            <Field
              id={`age-${seatNo}`}
              label={t("book.details.age")}
              required
              error={fieldErrors?.age ? t("book.details.errors.age") : undefined}
            >
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={120}
                className="max-w-32"
                {...register(`passengers.${index}.age`)}
              />
            </Field>

            <fieldset className="flex flex-col gap-2" aria-describedby={`gender-${seatNo}-hint`}>
              <legend id={`gender-${seatNo}-label`} className="text-body font-medium text-fg">
                {t("book.details.gender")}
              </legend>
              <p id={`gender-${seatNo}-hint`} className="text-small text-muted">
                {t("book.details.genderHint")}
              </p>
              <Controller
                control={control}
                name={`passengers.${index}.gender`}
                render={({ field }) => (
                  <RadioGroup
                    value={field.value ?? ""}
                    onValueChange={field.onChange}
                    onBlur={field.onBlur}
                    ref={field.ref}
                    className="flex flex-wrap gap-2"
                    aria-labelledby={`gender-${seatNo}-label`}
                    aria-invalid={fieldErrors?.gender ? true : undefined}
                  >
                    {GENDERS.map((gender) => (
                      <label
                        key={gender}
                        className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-strong px-3 has-[[data-state=checked]]:border-primary"
                      >
                        <RadioGroupItem
                          value={gender}
                          isError={Boolean(fieldErrors?.gender)}
                          aria-labelledby={`gender-${seatNo}-${gender}`}
                        />
                        <span id={`gender-${seatNo}-${gender}`} className="text-body text-fg">
                          {t(`book.details.genders.${gender}`)}
                        </span>
                      </label>
                    ))}
                  </RadioGroup>
                )}
              />
              {fieldErrors?.gender && (
                <p className="text-small text-status-danger" role="alert">
                  {t("book.details.errors.gender")}
                </p>
              )}
            </fieldset>
          </Card>
        );
      })}

      {submitError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-status-danger-soft bg-status-danger-soft p-3 text-small text-status-danger"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {submitError}
        </p>
      )}

      <div className="sticky bottom-16 z-sticky -mx-gutter border-t border-default bg-surface-raised px-gutter py-3 md:bottom-0 md:mx-0 md:rounded-lg md:border">
        <Button
          type="submit"
          size="lg"
          className="w-full sm:w-auto"
          loading={formState.isSubmitting}
        >
          {t("book.details.continue")}
        </Button>
      </div>
    </form>
  );
}
