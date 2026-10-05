"use client";

import { formatDate, formatTime } from "@aptransit/shared";
import { Button, Card } from "@aptransit/ui";
import { ArrowRight, RotateCcw, WifiOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { listOfflineTickets, type OfflineTicket } from "../../lib/offline-tickets";

/** Calm message, the tickets saved on this phone (still valid), and Retry. */
export function OfflineView() {
  const t = useTranslations();
  const locale = useLocale();
  const [tickets, setTickets] = useState<OfflineTicket[] | null>(null);

  useEffect(() => {
    let alive = true;
    void listOfflineTickets().then((list) => {
      if (alive) setTickets(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  const pick = (p: { nameEn: string; nameTe: string }) => (locale === "te" ? p.nameTe : p.nameEn);

  return (
    <>
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-surface text-muted">
          <WifiOff className="size-7" aria-hidden="true" />
        </span>
        <h1 className="text-h1 text-fg">{t("offlinePage.title")}</h1>
        <p className="text-body text-muted">{t("offlinePage.hint")}</p>
        <Button size="lg" leftIcon={<RotateCcw className="size-4" aria-hidden="true" />} onClick={() => window.location.reload()}>
          {t("common.retry")}
        </Button>
      </div>

      {tickets && tickets.length > 0 && (
        <section aria-labelledby="offline-tickets" className="flex flex-col gap-3">
          <h2 id="offline-tickets" className="text-h2 text-fg">
            {t("offlinePage.savedTickets")}
          </h2>
          <ul className="flex flex-col gap-2">
            {tickets.map(({ id, ticket }) => (
              <li key={id}>
                {/* A full page load: the service worker serves the saved ticket page */}
                <a href={`/tickets/${id}`} className="block">
                  <Card variant="interactive" padding="md" className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 flex-col">
                      <span className="text-body font-medium text-fg">
                        {t("common.routeFromTo", { from: pick(ticket.boarding), to: pick(ticket.dropping) })}
                      </span>
                      <span className="text-small text-muted">
                        {formatDate(ticket.departureAt, locale)}, {formatTime(ticket.departureAt, locale)}
                        {ticket.seatNo ? ` · ${t("tickets.seat", { seat: ticket.seatNo })}` : ""}
                      </span>
                    </span>
                    <ArrowRight className="size-5 shrink-0 text-muted" aria-hidden="true" />
                  </Card>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      {tickets && tickets.length === 0 && <p className="text-center text-small text-muted">{t("offlinePage.noTickets")}</p>}
    </>
  );
}
