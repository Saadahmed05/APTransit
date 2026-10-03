"use client";

import { formatDate, formatMoney, formatTime, TICKET_STATUS_MAP, type TicketSummaryDto } from "@aptransit/shared";
import { Card, TicketStatusBadge } from "@aptransit/ui";
import { ArrowRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

/** My tickets row and confirmation preview: route, date and departure, seat, status, code. */
export function TicketSummaryCard({ ticket }: { ticket: TicketSummaryDto }) {
  const t = useTranslations();
  const locale = useLocale();
  const pick = (p: { nameEn: string; nameTe: string }) => (locale === "te" ? p.nameTe : p.nameEn);
  const statusLabel = t(TICKET_STATUS_MAP[ticket.status].i18nKey);
  const date = formatDate(new Date(`${ticket.serviceDate}T00:00:00.000Z`), locale);
  const time = formatTime(ticket.departureAt, locale);
  const serviceKey = `serviceType.${ticket.serviceType}`;

  return (
    <Card
      padding="md"
      className="flex flex-col gap-3"
      role="group"
      aria-label={t("tickets.cardLabel", {
        route: t("common.routeFromTo", { from: pick(ticket.boarding), to: pick(ticket.dropping) }),
        date,
        time,
        seat: ticket.seatNo ?? "",
        status: statusLabel,
      })}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-body font-semibold text-fg">
          <span className="break-words">{pick(ticket.boarding)}</span>
          <ArrowRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
          <span className="break-words">{pick(ticket.dropping)}</span>
        </div>
        <TicketStatusBadge status={ticket.status} label={statusLabel} size="sm" />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-h3 font-tabular text-fg">{time}</p>
          <p className="text-small text-muted">
            {date} · {t.has(serviceKey) ? t(serviceKey) : ticket.serviceType}
          </p>
        </div>
        {ticket.seatNo && <p className="text-body font-semibold text-fg">{t("tickets.seat", { seat: ticket.seatNo })}</p>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-default pt-2 text-caption text-muted">
        <span className="font-mono">{t("tickets.code", { code: ticket.code })}</span>
        {ticket.refund && (
          <span className={ticket.refund.status === "PROCESSED" ? "text-muted" : "text-status-info"}>
            {ticket.refund.status === "PROCESSED"
              ? t("tickets.refundDone", { amount: formatMoney(ticket.refund.amountPaise, locale) })
              : t("tickets.refundPending")}
          </span>
        )}
      </div>
    </Card>
  );
}
