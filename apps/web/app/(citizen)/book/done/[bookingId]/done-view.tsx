"use client";

import { BookingDto, formatDate, formatTime, type PlaceDto, ServiceDateString, TicketsResponse, formatIstDate } from "@aptransit/shared";
import { Button, EmptyState, ErrorState, Skeleton } from "@aptransit/ui";
import { useQuery } from "@tanstack/react-query";
import { CircleCheck, Clock, Repeat } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TicketSummaryCard } from "../../../../../components/ticket-summary-card";
import { api, errorKey } from "../../../../../lib/api";
import { queryKeys } from "../../../../../lib/query-keys";
import { saveSearch } from "../../../../../lib/saved-search";

const POLL_MS = 3_000;
const POLL_FOR_MS = 30_000;

export function DoneView({ bookingId }: { bookingId: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);

  // The webhook may confirm a moment after the redirect: poll for up to 30 s
  const bookingQuery = useQuery({
    queryKey: queryKeys.booking(bookingId),
    queryFn: ({ signal }) => api(`/bookings/${bookingId}`, { schema: BookingDto, signal }),
    refetchInterval: (query) =>
      query.state.data?.status === "PENDING_PAYMENT" && Date.now() - startedAt < POLL_FOR_MS ? POLL_MS : false,
  });
  const confirmed = bookingQuery.data?.status === "CONFIRMED";
  const ticketsQuery = useQuery({
    queryKey: queryKeys.tickets("upcoming"),
    queryFn: ({ signal }) => api("/tickets", { query: { scope: "upcoming" }, schema: TicketsResponse, signal }),
    enabled: confirmed,
  });

  useEffect(() => {
    if (confirmed) return;
    const id = window.setInterval(() => setNow(Date.now()), POLL_MS);
    return () => window.clearInterval(id);
  }, [confirmed]);

  if (bookingQuery.isLoading || (confirmed && ticketsQuery.isLoading)) {
    return (
      <div className="flex flex-col items-center gap-4" aria-busy="true">
        <span className="sr-only" role="status">
          {t("common.loading")}
        </span>
        <Skeleton className="size-16 rounded-full" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-36 w-full rounded-lg" />
      </div>
    );
  }

  const failed = bookingQuery.error ?? ticketsQuery.error;
  if (failed || !bookingQuery.data) {
    return (
      <ErrorState
        title={t("book.done.errorTitle")}
        message={t(errorKey(failed, (k) => t.has(k)))}
        retryLabel={t("common.retry")}
        onRetry={() => {
          void bookingQuery.refetch();
          void ticketsQuery.refetch();
        }}
      />
    );
  }

  if (!confirmed) {
    const stillWaiting = now - startedAt < POLL_FOR_MS && bookingQuery.data.status === "PENDING_PAYMENT";
    return (
      <EmptyState
        headingLevel="h1"
        icon={Clock}
        title={stillWaiting ? t("book.done.waitingTitle") : t("book.done.notConfirmedTitle")}
        hint={stillWaiting ? t("book.done.waitingHint") : t("book.review.checkingHint", { code: bookingQuery.data.code })}
        role="status"
      />
    );
  }

  const tickets = (ticketsQuery.data ?? []).filter((ticket) => ticket.bookingId === bookingId);
  const first = tickets[0];
  const pick = (p: { nameEn: string; nameTe: string }) => (locale === "te" ? p.nameTe : p.nameEn);
  const opensAt = first ? new Date(first.activationOpensAt) : null;

  const bookReturn = () => {
    if (!first) return;
    const place = (p: typeof first.boarding): PlaceDto => ({
      id: p.stopId,
      kind: "STOP",
      nameEn: p.nameEn,
      nameTe: p.nameTe,
      districtNameEn: "",
      districtNameTe: "",
    });
    const today = formatIstDate(new Date());
    // The home form reads the saved search: From and To swapped
    saveSearch({ from: place(first.dropping), to: place(first.boarding), date: ServiceDateString.parse(today) });
    router.push("/");
  };

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-6 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-status-success-soft text-status-success">
        <CircleCheck className="size-9" aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-1">
        <h1 className="text-h1 text-fg">{t("book.done.title")}</h1>
        {first && (
          <p className="text-body text-muted">
            {t("book.done.ticketCount", { count: tickets.length })} ·{" "}
            {t("book.done.summary", {
              route: t("common.routeFromTo", { from: pick(first.boarding), to: pick(first.dropping) }),
              date: formatDate(new Date(`${first.serviceDate}T00:00:00.000Z`), locale),
              time: formatTime(first.departureAt, locale),
            })}
          </p>
        )}
      </div>

      <div className="flex w-full flex-col gap-3 text-left">
        {tickets.map((ticket) => (
          <TicketSummaryCard key={ticket.id} ticket={ticket} />
        ))}
      </div>

      {opensAt && (
        <p className="flex items-center gap-2 text-small text-muted">
          <Clock className="size-4 shrink-0" aria-hidden="true" />
          {t("book.done.activateHint", {
            time: `${formatDate(opensAt, locale)}, ${formatTime(opensAt, locale)}`,
          })}
        </p>
      )}

      <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <Button asChild size="lg">
          <Link href="/tickets">{t("book.done.viewTicket")}</Link>
        </Button>
        <Button variant="secondary" size="lg" onClick={bookReturn} leftIcon={<Repeat className="size-4" aria-hidden="true" />}>
          {t("book.done.returnJourney")}
        </Button>
      </div>
    </div>
  );
}
