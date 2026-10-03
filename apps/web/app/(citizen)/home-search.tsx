"use client";

import { formatIstDate, type PlaceDto } from "@aptransit/shared";
import { Button, Card, DatePicker, IconButton, Skeleton } from "@aptransit/ui";
import { ArrowUpDown, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useSyncExternalStore } from "react";
import { PlaceCombobox } from "../../components/place-combobox";
import {
  MAX_DAYS_AHEAD,
  readSavedSearch as readSaved,
  type SavedSearch,
  saveSearch as save,
} from "../../lib/saved-search";

const noopSubscribe = () => () => {};

/** Renders the form only in the browser: it starts from session storage and the IST date. */
export function HomeSearch() {
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const t = useTranslations("home");
  if (!mounted) {
    return (
      <Card padding="lg" className="flex flex-col gap-5" aria-busy="true">
        <span className="sr-only" role="status">
          {t("loadingForm")}
        </span>
        <Skeleton className="h-13 w-full" />
        <Skeleton className="h-13 w-full" />
        <Skeleton className="h-11 w-2/3" />
        <Skeleton className="h-14 w-full" />
      </Card>
    );
  }
  return <SearchForm />;
}

interface Errors {
  from?: string;
  to?: string;
}

function SearchForm() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [today] = useState(() => formatIstDate(new Date()));
  const [initial] = useState(() => readSaved(today));
  const [from, setFrom] = useState<PlaceDto | null>(initial.from);
  const [to, setTo] = useState<PlaceDto | null>(initial.to);
  const [date, setDate] = useState(initial.date);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  const update = (next: Partial<SavedSearch>) => {
    const merged = { from, to, date, ...next };
    save(merged);
    if (next.from !== undefined) setFrom(next.from);
    if (next.to !== undefined) setTo(next.to);
    if (next.date !== undefined) setDate(next.date);
    if (next.from || next.to) setErrors({});
  };

  const validate = (): Errors => {
    const found: Errors = {};
    if (!from) found.from = t("home.errors.fromRequired");
    if (!to) found.to = t("home.errors.toRequired");
    if (from && to && from.id === to.id) found.to = t("home.errors.samePlace");
    return found;
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (found.from || found.to || !from || !to) {
      document.getElementById(found.from ? "home-from" : "home-to")?.focus();
      return;
    }
    setSubmitting(true);
    const params = new URLSearchParams({ from: from.id, to: to.id, date });
    router.push(`/search?${params.toString()}`);
  };

  return (
    <Card padding="lg" className="flex flex-col gap-5">
      <form onSubmit={onSubmit} noValidate aria-label={t("home.question")} className="flex flex-col gap-5">
        <div className="flex items-end gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <PlaceCombobox
              id="home-from"
              icon="from"
              label={t("common.from")}
              placeholder={t("home.fromPlaceholder")}
              value={from}
              onChange={(place) => update({ from: place })}
              error={errors.from}
            />
            <PlaceCombobox
              id="home-to"
              icon="to"
              label={t("common.to")}
              placeholder={t("home.toPlaceholder")}
              value={to}
              onChange={(place) => update({ to: place })}
              error={errors.to}
            />
          </div>
          <IconButton
            variant="secondary"
            size="lg"
            aria-label={t("home.swap")}
            className="mb-10 shrink-0"
            onClick={() => update({ from: to, to: from })}
          >
            <ArrowUpDown className="size-5" aria-hidden="true" />
          </IconButton>
        </div>

        <div className="flex flex-col gap-2">
          <span id="home-date-label" className="text-body font-medium text-fg">
            {t("common.date")}
          </span>
          <DatePicker
            value={date}
            onChange={(next) => update({ date: next })}
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

        <Button type="submit" size="xl" loading={submitting} leftIcon={<Search className="size-5" aria-hidden="true" />}>
          {t("search.cta")}
        </Button>
      </form>
    </Card>
  );
}
