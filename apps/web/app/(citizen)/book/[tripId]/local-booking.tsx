"use client";

import {
  BOOKING_MAX_PASSENGERS,
  BookingDto,
  CHILD_MAX_AGE,
  type FareDto,
  formatMoney,
  groupFare,
  passengerCategory,
  passengerFarePaise,
  MeDto,
  SENIOR_MIN_AGE,
  UpdateMeInput,
} from "@aptransit/shared";
import { Button, Card, Field, Input } from "@aptransit/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, TriangleAlert, Users, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { useMe } from "../../../../components/auth-provider";
import { api, errorKey } from "../../../../lib/api";
import { queryKeys } from "../../../../lib/query-keys";

const MAX_AGE = 120;

/** An age the server accepts, or null while the field is empty or half typed. */
function parseAge(value: string): number | null {
  if (!/^\d{1,3}$/.test(value)) return null;
  const age = Number(value);
  return age >= 1 && age <= MAX_AGE ? age : null;
}

/**
 * D-046: local buses and trips of 50 km or less have no seats to pick. The traveller gives an age for
 * each person and the name comes from the account. The server prices adult, child and senior fares.
 */
export function LocalBooking({
  tripId,
  fare,
  boardingId,
  droppingId,
  stops,
}: {
  tripId: string;
  fare: FareDto;
  boardingId: string;
  droppingId: string;
  /** The boarding and destination pickers, shared with the seat flow. */
  stops: ReactNode;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();
  // The ticket carries the account name. An OTP account may not have one yet: ask once.
  const needsName = Boolean(me.data) && !me.data?.name;
  const [name, setName] = useState("");
  const [ages, setAges] = useState<string[]>([""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = ages.map(parseAge);
  const valid = parsed.filter((a): a is number => a !== null);
  const nameOk = !needsName || UpdateMeInput.safeParse({ name: name.trim() }).success;
  const allValid = valid.length === ages.length && nameOk && !me.isLoading;
  const total = groupFare(fare.totalPaise, valid).totalPaise;

  const setAge = (i: number, value: string) =>
    setAges((prev) => prev.map((a, j) => (j === i ? value.replace(/\D/g, "").slice(0, 3) : a)));

  const onBook = async () => {
    if (!allValid || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (needsName) {
        const updated = await api("/me", { method: "PATCH", body: { name: name.trim() }, schema: MeDto });
        queryClient.setQueryData(queryKeys.me, updated);
      }
      const booking = await api("/bookings", {
        method: "POST",
        // One key per attempt: a network retry cannot create a second booking
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: {
          tripId,
          boardingStopId: boardingId,
          droppingStopId: droppingId,
          passengers: valid.map((age) => ({ age })),
        },
        schema: BookingDto,
      });
      router.push(`/book/${tripId}/review?booking=${booking.id}`);
    } catch (err) {
      setError(t(errorKey(err, (k) => t.has(k))));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6" data-testid="local-booking">
      <h1 className="text-h1 text-fg">{t("book.local.heading")}</h1>
      <p className="text-body text-muted">{t("book.local.intro")}</p>

      {stops}

      {needsName && (
        <Card padding="md" className="flex flex-col gap-2">
          <Field id="local-name" label={t("book.local.nameLabel")} hint={t("book.local.nameHint")} required>
            <Input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </Card>
      )}

      <Card padding="md" className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-h3 text-fg">
          <Users className="size-5" aria-hidden="true" />
          {t("book.local.travellers")}
        </h2>
        <p className="text-small text-muted">
          {t("book.local.rules", { child: CHILD_MAX_AGE, senior: SENIOR_MIN_AGE })}
        </p>
        <ul className="flex flex-col gap-3">
          {ages.map((value, i) => {
            const age = parsed[i];
            const category = age === null || age === undefined ? null : passengerCategory(age);
            return (
              <li key={i} className="flex items-end gap-3">
                <Field
                  id={`local-age-${i}`}
                  label={t("book.local.ageOf", { n: i + 1 })}
                  className="w-28"
                >
                  <Input
                    inputMode="numeric"
                    autoComplete="off"
                    value={value}
                    onChange={(e) => setAge(i, e.target.value)}
                  />
                </Field>
                <p className="min-w-0 flex-1 pb-3 text-small text-fg" aria-live="polite">
                  {category && age !== null && age !== undefined ? (
                    <>
                      <span className="font-medium">{t(`book.local.category.${category}`)}</span>
                      {" · "}
                      <span className="tabular-nums">
                        {formatMoney(passengerFarePaise(fare.totalPaise, age), locale)}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted">{t("book.local.enterAge")}</span>
                  )}
                </p>
                {ages.length > 1 && (
                  <Button
                    variant="ghost"
                    className="px-0 w-11"
                    aria-label={t("book.local.remove", { n: i + 1 })}
                    onClick={() => setAges((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <X className="size-5" aria-hidden="true" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        {ages.length < BOOKING_MAX_PASSENGERS && (
          <Button variant="secondary" onClick={() => setAges((prev) => [...prev, ""])}>
            <Plus className="size-5" aria-hidden="true" />
            {t("book.local.add")}
          </Button>
        )}
        <p className="text-small text-muted">{t("book.local.noSeat")}</p>
      </Card>

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
          <p className="text-h3 tabular-nums text-fg">
            <span className="sr-only">{t("book.seat.total")}: </span>
            {valid.length === ages.length ? formatMoney(total, locale) : t("book.local.dash")}
          </p>
          <Button size="lg" onClick={onBook} disabled={!allValid || busy}>
            {t("book.local.book")}
          </Button>
        </div>
      </div>
    </div>
  );
}
