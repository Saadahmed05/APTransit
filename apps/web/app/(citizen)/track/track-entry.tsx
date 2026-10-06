"use client";
import {
  formatIstDate,
  formatTime,
  type PlaceDto,
  SearchTripsResponse,
  TicketsResponse,
} from "@aptransit/shared";
import { Button, Card, EmptyState, ErrorState, Field, Input, Skeleton } from "@aptransit/ui";
import { useQuery } from "@tanstack/react-query";
import { Bus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "../../../components/auth-provider";
import { PlaceCombobox } from "../../../components/place-combobox";
import { api, errorKey } from "../../../lib/api";
export function TrackEntry() {
  const t = useTranslations("tracking"),
    root = useTranslations(),
    locale = useLocale(),
    router = useRouter();
  const { status } = useAuth();
  const [code, setCode] = useState(""),
    [missing, setMissing] = useState(false),
    [from, setFrom] = useState<PlaceDto | null>(null),
    [to, setTo] = useState<PlaceDto | null>(null),
    [search, setSearch] = useState<{ from: string; to: string; date: string } | null>(null);
  const tickets = useQuery({
    queryKey: ["tickets", "upcoming"],
    queryFn: ({ signal }) =>
      api("/tickets", { schema: TicketsResponse, query: { scope: "upcoming" }, signal }),
    enabled: status === "authenticated",
  });
  const trips = useQuery({
    queryKey: ["tracking", "search", search],
    queryFn: ({ signal }) =>
      api("/search/trips", {
        schema: SearchTripsResponse,
        query: search!,
        signal,
        redirectOn401: false,
      }),
    enabled: !!search,
  });
  const running =
    trips.data?.filter((x) => ["RUNNING", "DELAYED", "INCIDENT"].includes(x.displayStatus)) ?? [];
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-gutter py-6">
      <h1 className="text-h1 text-fg">{t("title")}</h1>
      <section className="flex flex-col gap-3">
        <h2 className="text-h2">{t("yourTickets")}</h2>
        {status !== "authenticated" ? (
          <Button asChild variant="secondary">
            <Link href="/login?next=/track">{t("signIn")}</Link>
          </Button>
        ) : tickets.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : tickets.isError ? (
          <ErrorState
            title={t("errorTitle")}
            message={root(errorKey(tickets.error, (k) => root.has(k)))}
            retryLabel={root("common.retry")}
            onRetry={() => void tickets.refetch()}
          />
        ) : !tickets.data?.length ? (
          <EmptyState title={t("noTickets")} icon={Bus} />
        ) : (
          tickets.data.map((x) => (
            <Card key={x.id} className="p-4">
              <Link
                className="flex min-h-11 flex-col text-body text-primary"
                href={`/track/${x.tripId}`}
              >
                {locale === "te" ? x.routeNameTe : x.routeNameEn}
                <span className="text-small text-muted">
                  {x.code}, {formatTime(x.departureAt, locale)}
                </span>
              </Link>
            </Card>
          ))
        )}
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const ticket = tickets.data?.find(
              (x) => x.code.toUpperCase() === code.trim().toUpperCase(),
            );
            if (ticket) router.push(`/track/${ticket.tripId}`);
            else setMissing(true);
          }}
        >
          <Field label={t("ticketCode")} id="ticket-code">
            <Input
              id="ticket-code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setMissing(false);
              }}
              required
              maxLength={13}
            />
          </Field>
          <Button variant="secondary" type="submit">
            {t("findTicket")}
          </Button>
          {missing && (
            <p role="alert" className="text-small text-status-danger">
              {t("ticketMissing")}
            </p>
          )}
        </form>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-h2">{t("routeSearch")}</h2>
        <form
          className="grid gap-3 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (from && to)
              setSearch({ from: from.id, to: to.id, date: formatIstDate(new Date()) });
          }}
        >
          <PlaceCombobox
            id="track-from"
            label={t("from")}
            placeholder={t("placeHint")}
            value={from}
            onChange={setFrom}
          />
          <PlaceCombobox
            id="track-to"
            label={t("to")}
            placeholder={t("placeHint")}
            value={to}
            onChange={setTo}
          />
          <Button type="submit" disabled={!from || !to}>
            {t("search")}
          </Button>
        </form>
        {trips.isFetching && <Skeleton className="h-24 w-full" />}
        {trips.isError && (
          <ErrorState
            title={t("errorTitle")}
            message={root(errorKey(trips.error, (k) => root.has(k)))}
            retryLabel={root("common.retry")}
            onRetry={() => void trips.refetch()}
          />
        )}
        {search && !trips.isFetching && !trips.isError && !running.length && (
          <EmptyState title={t("noRunning")} icon={Bus} />
        )}{" "}
        {running.map((x) => (
          <Button asChild key={x.tripId} variant="secondary">
            <Link href={`/track/${x.tripId}`}>
              {x.routeCode}, {formatTime(x.departureAt, locale)}
            </Link>
          </Button>
        ))}
      </section>
    </div>
  );
}
