"use client";

import {
  formatDate,
  formatDuration,
  formatIstDate,
  formatMoney,
  formatTime,
  type PlaceDto,
  SearchTripsResponse,
  ServiceDateString,
  type TripSummaryDto,
} from "@aptransit/shared";
import {
  addDays,
  Button,
  Card,
  cn,
  DatePicker,
  EmptyState,
  ErrorState,
  IconButton,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Skeleton,
  TripCard,
} from "@aptransit/ui";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ArrowUpDown, Bus, Calendar, Filter, Pencil, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useMemo, useState, useSyncExternalStore } from "react";
import { PlaceCombobox, placeName } from "../../../components/place-combobox";
import { api, errorKey } from "../../../lib/api";
import { queryKeys } from "../../../lib/query-keys";
import { MAX_DAYS_AHEAD, readSavedSearch, saveSearch } from "../../../lib/saved-search";

const TIME_BANDS = ["all", "morning", "afternoon", "evening", "night"] as const;
type TimeBand = (typeof TIME_BANDS)[number];

function getIstHour(isoString: string): number {
  const hour = Number.parseInt(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }).format(
      new Date(isoString),
    ),
    10,
  );
  // en-GB prints midnight as 24 in some engines
  return Number.isNaN(hour) ? 0 : hour % 24;
}

function matchesTimeBand(departureAt: string, band: TimeBand): boolean {
  if (band === "all") return true;
  const hour = getIstHour(departureAt);
  if (band === "morning") return hour >= 5 && hour < 12;
  if (band === "afternoon") return hour >= 12 && hour < 17;
  if (band === "evening") return hour >= 17 && hour < 21;
  return hour >= 21 || hour < 5;
}

const noopSubscribe = () => () => {};

export function SearchClient({
  initialFromId,
  initialToId,
  initialDate,
  initialAfter,
}: {
  initialFromId?: string;
  initialToId?: string;
  initialDate?: string;
  initialAfter?: string;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const [today] = useState(() => formatIstDate(new Date()));
  const fromId = searchParams.get("from") ?? initialFromId ?? "";
  const toId = searchParams.get("to") ?? initialToId ?? "";
  const rawDate = searchParams.get("date") ?? initialDate ?? today;
  const date = ServiceDateString.safeParse(rawDate).success ? rawDate : today;
  const after = searchParams.get("after") ?? initialAfter ?? undefined;

  const timeBandParam = searchParams.get("timeBand");
  const timeBand: TimeBand = TIME_BANDS.find((band) => band === timeBandParam) ?? "all";
  const [isEditOpen, setIsEditOpen] = useState(false);

  // The URL carries stop ids only. Names come from the search saved on this tab by the home form.
  const saved = mounted ? readSavedSearch(today) : null;
  const savedFrom = saved?.from?.id === fromId ? saved.from : null;
  const savedTo = saved?.to?.id === toId ? saved.to : null;

  // Edit form state: undefined means "not edited yet, use the current search"
  const [editFromOverride, setEditFrom] = useState<PlaceDto | null | undefined>(undefined);
  const [editToOverride, setEditTo] = useState<PlaceDto | null | undefined>(undefined);
  const [editDateOverride, setEditDate] = useState<string | undefined>(undefined);
  const editFrom = editFromOverride !== undefined ? editFromOverride : savedFrom;
  const editTo = editToOverride !== undefined ? editToOverride : savedTo;
  const editDate = editDateOverride ?? date;
  const [editErrors, setEditErrors] = useState<{ from?: string; to?: string }>({});

  const tripsQuery = useQuery({
    queryKey: queryKeys.searchTrips({ from: fromId, to: toId, date, after }),
    queryFn: ({ signal }) =>
      api("/search/trips", {
        query: { from: fromId, to: toId, date, after },
        schema: SearchTripsResponse,
        signal,
        redirectOn401: false,
      }),
    enabled: Boolean(fromId && toId),
  });

  const filteredTrips = useMemo(() => {
    if (!tripsQuery.data) return [];
    return tripsQuery.data.filter((trip) => matchesTimeBand(trip.departureAt, timeBand));
  }, [tripsQuery.data, timeBand]);

  const pushSearch = (params: URLSearchParams) => router.push(`/search?${params.toString()}`);

  const onEditSubmit = (e: FormEvent) => {
    e.preventDefault();
    const errors: { from?: string; to?: string } = {};
    if (!editFrom) errors.from = t("home.errors.fromRequired");
    if (!editTo) errors.to = t("home.errors.toRequired");
    if (editFrom && editTo && editFrom.id === editTo.id) {
      errors.to = t("home.errors.samePlace");
    }
    setEditErrors(errors);
    if (errors.from || errors.to || !editFrom || !editTo) return;

    saveSearch({ from: editFrom, to: editTo, date: editDate });
    const params = new URLSearchParams(searchParams.toString());
    params.set("from", editFrom.id);
    params.set("to", editTo.id);
    params.set("date", editDate);
    setEditFrom(undefined);
    setEditTo(undefined);
    setEditDate(undefined);
    setIsEditOpen(false);
    pushSearch(params);
  };

  const handleNextDay = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", addDays(date, 1));
    pushSearch(params);
  };

  const updateTimeBand = (nextBand: TimeBand) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextBand === "all") params.delete("timeBand");
    else params.set("timeBand", nextBand);
    pushSearch(params);
  };

  const fromLabel = savedFrom ? placeName(savedFrom, locale) : t("common.from");
  const toName = savedTo ? placeName(savedTo, locale) : null;
  const toLabel = toName ?? t("common.to");
  const formattedDate = formatDate(new Date(`${date}T00:00:00.000Z`), locale);

  const timeBandLabels: Record<TimeBand, string> = {
    all: t("search.timeBands.all"),
    morning: t("search.timeBands.morning"),
    afternoon: t("search.timeBands.afternoon"),
    evening: t("search.timeBands.evening"),
    night: t("search.timeBands.night"),
  };

  const datePickerProps = {
    today,
    maxDaysAhead: MAX_DAYS_AHEAD,
    locale: locale === "te" ? "te-IN" : "en-IN",
    groupLabel: t("common.date"),
    labels: {
      today: t("home.date.today"),
      tomorrow: t("home.date.tomorrow"),
      pickDate: t("home.date.pick"),
      close: t("common.close"),
      previousMonth: t("home.date.previousMonth"),
      nextMonth: t("home.date.nextMonth"),
    },
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Sticky Top Summary Bar */}
      <div
        data-testid="search-summary-bar"
        className="sticky top-16 z-sticky -mx-gutter border-b border-default bg-surface px-gutter py-3 md:static md:mx-0 md:border-none md:p-0"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-x-1.5 text-body font-semibold text-fg">
              <span className="break-words">{fromLabel}</span>
              <ArrowRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
              <span className="break-words">{toLabel}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-caption text-muted">
              <span className="flex items-center gap-1 font-tabular">
                <Calendar className="size-3.5" aria-hidden="true" />
                {formattedDate}
              </span>
              {tripsQuery.data && (
                <span role="status">
                  <span aria-hidden="true">· </span>
                  {t("search.resultsCount", { count: filteredTrips.length })}
                </span>
              )}
            </div>
          </div>

          <Button
            variant="secondary"
            size="md"
            className="md:hidden"
            onClick={() => setIsEditOpen(true)}
            leftIcon={<Pencil className="size-3.5" aria-hidden="true" />}
          >
            {t("search.editSearch")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
        {/* Left Column on MD+: Search Form & Time Filters */}
        <aside className="hidden md:col-span-4 md:flex md:flex-col md:gap-6">
          <Card padding="md" className="flex flex-col gap-4">
            <h2 className="text-body-lg font-semibold text-fg">{t("search.editSearch")}</h2>
            <form onSubmit={onEditSubmit} noValidate className="flex flex-col gap-4">
              <div className="flex flex-col gap-3">
                <PlaceCombobox
                  id="search-desktop-from"
                  icon="from"
                  label={t("common.from")}
                  placeholder={t("home.fromPlaceholder")}
                  value={editFrom}
                  onChange={(p) => {
                    setEditFrom(p);
                    setEditErrors((e) => ({ ...e, from: undefined }));
                  }}
                  error={editErrors.from}
                />
                <div className="flex justify-end">
                  <IconButton
                    type="button"
                    variant="ghost"
                    size="md"
                    aria-label={t("home.swap")}
                    onClick={() => {
                      setEditFrom(editTo);
                      setEditTo(editFrom);
                    }}
                  >
                    <ArrowUpDown className="size-4" aria-hidden="true" />
                  </IconButton>
                </div>
                <PlaceCombobox
                  id="search-desktop-to"
                  icon="to"
                  label={t("common.to")}
                  placeholder={t("home.toPlaceholder")}
                  value={editTo}
                  onChange={(p) => {
                    setEditTo(p);
                    setEditErrors((e) => ({ ...e, to: undefined }));
                  }}
                  error={editErrors.to}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-small font-medium text-fg">{t("common.date")}</span>
                <DatePicker value={editDate} onChange={setEditDate} {...datePickerProps} />
              </div>

              <Button type="submit" size="md" leftIcon={<Search className="size-4" aria-hidden="true" />}>
                {t("search.cta")}
              </Button>
            </form>
          </Card>

          {/* Time Band Filters Desktop */}
          <Card padding="md" className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 text-small font-semibold text-fg">
              <Filter className="size-4 text-muted" aria-hidden="true" />
              {t("search.filterByTime")}
            </h2>
            <div className="flex flex-col gap-1.5">
              {TIME_BANDS.map((band) => {
                const active = timeBand === band;
                return (
                  <button
                    key={band}
                    type="button"
                    aria-pressed={active}
                    onClick={() => updateTimeBand(band)}
                    className={cn(
                      "flex min-h-11 items-center rounded-md px-3 text-left text-small transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      active ? "bg-primary font-medium text-on-primary" : "bg-surface text-fg hover:bg-surface-raised",
                    )}
                  >
                    {timeBandLabels[band]}
                  </button>
                );
              })}
            </div>
          </Card>
        </aside>

        {/* Right Column: Results & Mobile Filter Chips */}
        <section aria-label={t("search.title")} className="flex flex-col gap-4 md:col-span-8">
          {/* Mobile Time Filter Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:hidden" role="group" aria-label={t("search.filterByTime")}>
            {TIME_BANDS.map((band) => {
              const active = timeBand === band;
              return (
                <button
                  key={band}
                  type="button"
                  aria-pressed={active}
                  onClick={() => updateTimeBand(band)}
                  className={cn(
                    "min-h-11 shrink-0 rounded-full px-4 text-small font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    active
                      ? "bg-primary text-on-primary"
                      : "border border-default bg-surface text-muted hover:border-strong hover:text-fg",
                  )}
                >
                  {timeBandLabels[band]}
                </button>
              );
            })}
          </div>

          {/* No route in the URL: ask for one */}
          {(!fromId || !toId) && (
            <EmptyState
              icon={Bus}
              title={t("search.editSearch")}
              action={
                <Button variant="primary" onClick={() => setIsEditOpen(true)}>
                  {t("search.changeRoute")}
                </Button>
              }
            />
          )}

          {tripsQuery.isLoading && (
            <div className="flex flex-col gap-4" aria-busy="true">
              <span className="sr-only" role="status">
                {t("common.loading")}
              </span>
              <Skeleton className="h-36 w-full rounded-lg" />
              <Skeleton className="h-36 w-full rounded-lg" />
              <Skeleton className="h-36 w-full rounded-lg" />
            </div>
          )}

          {tripsQuery.isError && (
            <ErrorState
              title={t("search.errorTitle")}
              message={t(errorKey(tripsQuery.error, (k) => t.has(k)))}
              retryLabel={t("common.retry")}
              onRetry={() => tripsQuery.refetch()}
            />
          )}

          {tripsQuery.isSuccess && filteredTrips.length === 0 && (
            <div data-testid="search-empty">
              <EmptyState
                icon={Bus}
                title={t("search.emptyTitle")}
                hint={t("search.emptyHint")}
                action={
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <Button variant="primary" onClick={handleNextDay}>
                      {t("search.nextDay")}
                    </Button>
                    <Button variant="secondary" onClick={() => setIsEditOpen(true)}>
                      {t("search.changeRoute")}
                    </Button>
                  </div>
                }
              />
            </div>
          )}

          {tripsQuery.isSuccess && filteredTrips.length > 0 && (
            <div className="flex flex-col gap-3">
              {filteredTrips.map((trip: TripSummaryDto) => {
                const serviceKey = `serviceType.${trip.serviceType}`;
                const serviceName = t.has(serviceKey) ? t(serviceKey) : trip.serviceType;
                const departure = formatTime(trip.departureAt, locale);
                const arrival = formatTime(trip.arrivalAt, locale);
                const fare = formatMoney(trip.farePaise, locale);
                const seats = trip.seatsLeft > 0 ? t("common.seatsLeft", { count: trip.seatsLeft }) : t("search.full");
                const statusKey = `status.${trip.displayStatus}`;
                const statusLabel = t.has(statusKey) ? t(statusKey) : trip.displayStatus;
                const destination = toName ?? t("common.destination");

                return (
                  <TripCard
                    key={trip.tripId}
                    data-testid="trip-card"
                    linkAs={Link}
                    href={`/bus/${trip.tripId}?${new URLSearchParams({ from: fromId, to: toId }).toString()}`}
                    label={t("search.tripCardLabel", { departure, service: serviceName, destination, arrival, seats, fare })}
                    departureTime={departure}
                    arrivalTime={arrival}
                    duration={formatDuration(trip.durationMin, locale)}
                    serviceTypeName={serviceName}
                    destinationText={t("search.toDestination", { destination })}
                    seatsLeft={trip.seatsLeft}
                    fareFormatted={fare}
                    status={trip.displayStatus}
                    statusLabel={statusLabel}
                    freeTravelEligible={trip.freeTravelEligible}
                    freeTravelLabel={t("search.freeTravelEligible")}
                    approxLabel={t("search.approx")}
                    seatsLeftText={seats}
                    fullLabel={t("search.full")}
                    routeCode={trip.routeCode}
                  />
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Edit Form Sheet (Mobile) */}
      <Sheet open={isEditOpen} onOpenChange={setIsEditOpen}>
        <SheetContent className="max-h-[90vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t("search.editSearch")}</SheetTitle>
          </SheetHeader>
          <form onSubmit={onEditSubmit} noValidate className="mt-4 flex flex-col gap-4 pb-6">
            <PlaceCombobox
              id="search-sheet-from"
              icon="from"
              label={t("common.from")}
              placeholder={t("home.fromPlaceholder")}
              value={editFrom}
              onChange={(p) => {
                setEditFrom(p);
                setEditErrors((e) => ({ ...e, from: undefined }));
              }}
              error={editErrors.from}
            />
            <PlaceCombobox
              id="search-sheet-to"
              icon="to"
              label={t("common.to")}
              placeholder={t("home.toPlaceholder")}
              value={editTo}
              onChange={(p) => {
                setEditTo(p);
                setEditErrors((e) => ({ ...e, to: undefined }));
              }}
              error={editErrors.to}
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-small font-medium text-fg">{t("common.date")}</span>
              <DatePicker value={editDate} onChange={setEditDate} {...datePickerProps} />
            </div>
            <Button type="submit" size="xl" className="mt-2">
              {t("search.cta")}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
