"use client";

import {
  formatDate,
  formatDuration,
  formatIstDate,
  formatMoney,
  formatTime,
  PlaceDto,
  PlacesSearchResponse,
  SearchTripsResponse,
  type TripSummaryDto,
} from "@aptransit/shared";
import {
  addDays,
  Button,
  Card,
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
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { PlaceCombobox, placeName } from "../../../components/place-combobox";
import { api, errorKey } from "../../../lib/api";
import { queryKeys } from "../../../lib/query-keys";

const MAX_DAYS_AHEAD = 30;

type TimeBand = "all" | "morning" | "afternoon" | "evening" | "night";

function getIstHour(isoString: string): number {
  const date = new Date(isoString);
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      hour12: false,
    });
    const hour = parseInt(formatter.format(date), 10);
    return isNaN(hour) ? date.getUTCHours() : hour;
  } catch {
    return date.getUTCHours();
  }
}

function matchesTimeBand(departureAt: string, band: TimeBand): boolean {
  if (band === "all") return true;
  const hour = getIstHour(departureAt);
  if (band === "morning") return hour >= 5 && hour < 12;
  if (band === "afternoon") return hour >= 12 && hour < 17;
  if (band === "evening") return hour >= 17 && hour < 21;
  if (band === "night") return hour >= 21 || hour < 5;
  return true;
}

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

  const [today] = useState(() => formatIstDate(new Date()));
  const fromId = searchParams.get("from") ?? initialFromId ?? "";
  const toId = searchParams.get("to") ?? initialToId ?? "";
  const date = searchParams.get("date") ?? initialDate ?? today;
  const after = searchParams.get("after") ?? initialAfter ?? undefined;

  const timeBandParam = searchParams.get("timeBand") as TimeBand | null;
  const timeBand: TimeBand = timeBandParam && ["all", "morning", "afternoon", "evening", "night"].includes(timeBandParam)
    ? timeBandParam
    : "all";
  const [isEditOpen, setIsEditOpen] = useState(false);

  // Edit form state
  const [editFrom, setEditFrom] = useState<PlaceDto | null>(null);
  const [editTo, setEditTo] = useState<PlaceDto | null>(null);
  const [editDate, setEditDate] = useState(date);
  const [editErrors, setEditErrors] = useState<{ from?: string; to?: string }>({});

  // Resolve Place objects for headers and edit form
  const fromPlaceQuery = useQuery({
    queryKey: ["place", fromId],
    queryFn: async () => {
      if (!fromId) return null;
      const res = await api("/places/search", {
        query: { q: fromId, limit: 1 },
        schema: PlacesSearchResponse,
        redirectOn401: false,
      });
      return res[0] ?? null;
    },
    enabled: Boolean(fromId),
    staleTime: 300_000,
  });

  const toPlaceQuery = useQuery({
    queryKey: ["place", toId],
    queryFn: async () => {
      if (!toId) return null;
      const res = await api("/places/search", {
        query: { q: toId, limit: 1 },
        schema: PlacesSearchResponse,
        redirectOn401: false,
      });
      return res[0] ?? null;
    },
    enabled: Boolean(toId),
    staleTime: 300_000,
  });

  // Sync edit form with resolved places
  useEffect(() => {
    if (fromPlaceQuery.data) setEditFrom(fromPlaceQuery.data);
    else if (fromId) {
      setEditFrom({
        id: fromId,
        kind: "STOP",
        nameEn: "Origin",
        nameTe: "ప్రారంభం",
        districtNameEn: "",
        districtNameTe: "",
      });
    }
  }, [fromPlaceQuery.data, fromId]);

  useEffect(() => {
    if (toPlaceQuery.data) setEditTo(toPlaceQuery.data);
    else if (toId) {
      setEditTo({
        id: toId,
        kind: "STOP",
        nameEn: "Destination",
        nameTe: "గమ్యం",
        districtNameEn: "",
        districtNameTe: "",
      });
    }
  }, [toPlaceQuery.data, toId]);

  useEffect(() => {
    setEditDate(date);
  }, [date]);

  // Trips Search Query
  const tripsQuery = useQuery({
    queryKey: queryKeys.searchTrips({ from: fromId, to: toId, date, after }),
    queryFn: ({ signal }) =>
      api("/search/trips", {
        query: { from: fromId, to: toId, date, after },
        schema: SearchTripsResponse,
        signal,
        redirectOn401: false,
      }),
    enabled: Boolean(fromId && toId && date),
  });

  const filteredTrips = useMemo(() => {
    if (!tripsQuery.data) return [];
    return tripsQuery.data.filter((trip) => matchesTimeBand(trip.departureAt, timeBand));
  }, [tripsQuery.data, timeBand]);

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

    const params = new URLSearchParams(searchParams.toString());
    params.set("from", editFrom.id);
    params.set("to", editTo.id);
    params.set("date", editDate);
    if (timeBand !== "all") params.set("timeBand", timeBand);
    else params.delete("timeBand");
    setIsEditOpen(false);
    router.push(`/search?${params.toString()}`);
  };

  const handleNextDay = () => {
    const nextDate = addDays(date, 1);
    const params = new URLSearchParams(searchParams.toString());
    params.set("from", fromId);
    params.set("to", toId);
    params.set("date", nextDate);
    if (timeBand !== "all") params.set("timeBand", timeBand);
    else params.delete("timeBand");
    router.push(`/search?${params.toString()}`);
  };

  const updateTimeBand = (nextBand: TimeBand) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextBand === "all") params.delete("timeBand");
    else params.set("timeBand", nextBand);
    router.push(`/search?${params.toString()}`);
  };

  const fromLabel = editFrom ? placeName(editFrom, locale) : t("common.from");
  const toLabel = editTo ? placeName(editTo, locale) : t("common.to");
  const formattedDate = formatDate(new Date(`${date}T00:00:00.000Z`), locale);

  const timeBands: { id: TimeBand; label: string }[] = [
    { id: "all", label: t("search.timeBands.all") },
    { id: "morning", label: t("search.timeBands.morning") },
    { id: "afternoon", label: t("search.timeBands.afternoon") },
    { id: "evening", label: t("search.timeBands.evening") },
    { id: "night", label: t("search.timeBands.night") },
  ];

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Sticky Top Summary Bar */}
      <div data-testid="search-summary-bar" className="sticky top-14 z-20 -mx-4 border-b border-default bg-surface px-4 py-3 shadow-xs md:static md:mx-0 md:border-none md:p-0 md:shadow-none">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center gap-1.5 text-body font-semibold text-fg">
                <span className="truncate">{fromLabel}</span>
                <ArrowRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
                <span className="truncate">{toLabel}</span>
              </div>
              <div className="flex items-center gap-2 text-caption text-muted">
                <span className="flex items-center gap-1 font-tabular">
                  <Calendar className="size-3.5" aria-hidden="true" />
                  {formattedDate}
                </span>
                {tripsQuery.data && (
                  <span>
                    • {t("search.resultsCount", { count: filteredTrips.length })}
                  </span>
                )}
              </div>
            </div>
          </div>

          <Button
            variant="secondary"
            size="md"
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
            <h2 className="text-body-lg font-semibold text-fg">
              {t("search.editSearch")}
            </h2>
            <form onSubmit={onEditSubmit} className="flex flex-col gap-4">
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
                      const temp = editFrom;
                      setEditFrom(editTo);
                      setEditTo(temp);
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
                <span className="text-small font-medium text-fg">
                  {t("common.date")}
                </span>
                <DatePicker
                  value={editDate}
                  onChange={setEditDate}
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

              <Button type="submit" size="md" leftIcon={<Search className="size-4" aria-hidden="true" />}>
                {t("search.cta")}
              </Button>
            </form>
          </Card>

          {/* Time Band Filters Desktop */}
          <Card padding="md" className="flex flex-col gap-3">
            <h2 className="text-small font-semibold text-fg flex items-center gap-2">
              <Filter className="size-4 text-muted" aria-hidden="true" />
              {t("search.filterByTime")}
            </h2>
            <div className="flex flex-col gap-1.5">
              {timeBands.map((band) => {
                const active = timeBand === band.id;
                return (
                  <button
                    key={band.id}
                    type="button"
                    onClick={() => updateTimeBand(band.id)}
                    className={`flex items-center justify-between rounded-md px-3 py-2 text-left text-small transition-colors ${
                      active
                        ? "bg-primary text-primary-fg font-medium"
                        : "bg-surface text-fg hover:bg-surface-raised"
                    }`}
                  >
                    <span>{band.label}</span>
                  </button>
                );
              })}
            </div>
          </Card>
        </aside>

        {/* Right Column / Main: Results & Mobile Filter Chips */}
        <main className="md:col-span-8 flex flex-col gap-4">
          {/* Mobile Time Filter Chips */}
          <div className="md:hidden flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar" role="region" aria-label={t("search.filterByTime")}>
            {timeBands.map((band) => {
              const active = timeBand === band.id;
              return (
                <button
                  key={band.id}
                  type="button"
                  onClick={() => updateTimeBand(band.id)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-small font-medium transition-colors ${
                    active
                      ? "bg-primary text-primary-fg"
                      : "bg-surface border border-default text-muted hover:border-strong hover:text-fg"
                  }`}
                >
                  {band.label}
                </button>
              );
            })}
          </div>

          {/* Results State Handling */}
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
                  <div className="flex items-center gap-3 flex-wrap justify-center">
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
                const departureFormatted = formatTime(trip.departureAt, locale);
                const arrivalFormatted = formatTime(trip.arrivalAt, locale);
                const durationFormatted = formatDuration(trip.durationMin, locale);
                const fareFormatted = formatMoney(trip.farePaise, locale);
                const seatsLeftText = t("common.seatsLeft", { count: trip.seatsLeft });
                const statusKey = `status.${trip.displayStatus}`;
                const statusLabel = t.has(statusKey) ? t(statusKey) : trip.displayStatus;

                return (
                  <TripCard
                    key={trip.tripId}
                    data-testid="trip-card"
                    departureTime={departureFormatted}
                    arrivalTime={arrivalFormatted}
                    duration={durationFormatted}
                    serviceTypeName={serviceName}
                    destinationName={toLabel}
                    seatsLeft={trip.seatsLeft}
                    fareFormatted={fareFormatted}
                    status={trip.displayStatus}
                    statusLabel={statusLabel}
                    freeTravelEligible={trip.freeTravelEligible}
                    freeTravelLabel={t("search.freeTravelEligible")}
                    approxLabel={t("search.approx")}
                    seatsLeftText={seatsLeftText}
                    fullLabel={t("search.full")}
                    routeCode={trip.routeCode}
                    href={`/bus/${trip.tripId}?from=${fromId}&to=${toId}`}
                  />
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* Edit Form Sheet (Mobile) */}
      <Sheet open={isEditOpen} onOpenChange={setIsEditOpen}>
        <SheetContent className="max-h-[90vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t("search.editSearch")}</SheetTitle>
          </SheetHeader>
          <form onSubmit={onEditSubmit} className="mt-4 flex flex-col gap-4 pb-6">
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
              <span className="text-small font-medium text-fg">
                {t("common.date")}
              </span>
              <DatePicker
                value={editDate}
                onChange={setEditDate}
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
            <Button type="submit" size="xl" className="mt-2">
              {t("search.cta")}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
