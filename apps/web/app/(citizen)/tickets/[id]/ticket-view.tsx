"use client";

import {
  formatDate,
  formatMoney,
  formatTime,
  STATUS_MAP,
  TICKET_STATUS_MAP,
  TicketDto,
  TicketQrDto,
} from "@aptransit/shared";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ErrorState,
  OfflineBanner,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  StatusBadge,
  TicketCard,
  TicketStatusBadge,
  toast,
} from "@aptransit/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Ban, Clock, Gift, Lock, MapPin, MessageSquare, MoreHorizontal, RotateCcw, XCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LiveQr, type LiveQrData } from "../../../../components/live-qr";
import { api, errorKey, isApiError } from "../../../../lib/api";
import { type OfflineTicket, readOfflineTicket, removeOfflineTicket, saveOfflineTicket } from "../../../../lib/offline-tickets";
import { serverOffsetMs } from "../../../../lib/qr-code";
import { queryKeys } from "../../../../lib/query-keys";
import { useNow, useOnline } from "../../../../lib/use-browser-state";

const REFETCH_MS = 30_000;
const FINAL = new Set(["USED", "EXPIRED", "CANCELLED", "REFUNDED"]);

type QrWithOffset = TicketQrDto & { serverOffsetMs: number };

export function TicketView({ id }: { id: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const online = useOnline();
  const queryClient = useQueryClient();
  const [cached, setCached] = useState<OfflineTicket | null | undefined>(undefined);
  const [activateOpen, setActivateOpen] = useState(false);
  const [justActivated, setJustActivated] = useState(false);

  // Sockets replace this poll on Day 12
  const ticketQuery = useQuery({
    queryKey: queryKeys.ticket(id),
    queryFn: ({ signal }) => api(`/tickets/${id}`, { schema: TicketDto, signal }),
    refetchInterval: REFETCH_MS,
    refetchOnWindowFocus: true,
    retry: (count, error) => !(isApiError(error) && (error.code === "NETWORK" || error.status === 404)) && count < 2,
  });
  const live = ticketQuery.data;

  const qrQuery = useQuery({
    queryKey: queryKeys.ticketQr(id),
    enabled: live?.status === "ACTIVE",
    staleTime: Infinity,
    queryFn: async ({ signal }): Promise<QrWithOffset> => {
      const qr = await api(`/tickets/${id}/qr`, { schema: TicketQrDto, signal });
      return { ...qr, serverOffsetMs: serverOffsetMs(qr.serverTime, Date.now()) };
    },
  });

  // The saved copy, read once; it is what the page shows when the network is gone
  useEffect(() => {
    let alive = true;
    void readOfflineTicket(id).then((entry) => {
      if (alive) setCached(entry);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  // Keep the offline copy in step with the server: saved while ACTIVE, gone once the ticket is over
  useEffect(() => {
    if (!live) return;
    const qr = qrQuery.data;
    if (live.status === "ACTIVE" && qr?.rotSecret && live.validUntil) {
      void saveOfflineTicket({
        id,
        ticket: live,
        qr: { token: qr.token, rotSecret: qr.rotSecret, periodSec: qr.periodSec, serverOffsetMs: qr.serverOffsetMs },
        validUntil: live.validUntil,
      });
    } else if (FINAL.has(live.status)) {
      void removeOfflineTicket(id);
    }
  }, [id, live, qrQuery.data]);

  const offline = !online || (isApiError(ticketQuery.error) && ticketQuery.error.code === "NETWORK");
  const ticket = live ?? (offline ? cached?.ticket : undefined);
  const qrData: LiveQrData | null = qrQuery.data?.rotSecret
    ? { token: qrQuery.data.token, rotSecret: qrQuery.data.rotSecret, periodSec: qrQuery.data.periodSec, serverOffsetMs: qrQuery.data.serverOffsetMs }
    : (cached?.qr ?? null);

  const activate = useMutation({
    mutationFn: () =>
      api(`/tickets/${id}/activate`, { method: "POST", schema: TicketDto, headers: { "Idempotency-Key": crypto.randomUUID() } }),
    onSuccess: (fresh) => {
      queryClient.setQueryData(queryKeys.ticket(id), fresh);
      void queryClient.invalidateQueries({ queryKey: ["tickets"] });
      setActivateOpen(false);
      setJustActivated(true);
      toast.success(t("ticketDetail.activated"));
    },
  });

  if (!ticket && (ticketQuery.isLoading || (offline && cached === undefined))) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4" aria-busy="true">
        <span className="sr-only" role="status">
          {t("common.loading")}
        </span>
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <ErrorState
        headingLevel="h1"
        title={t("ticketDetail.errorTitle")}
        message={offline ? t("ticketDetail.offlineNoCopy") : t(errorKey(ticketQuery.error, (k) => t.has(k)))}
        requestId={isApiError(ticketQuery.error) ? ticketQuery.error.requestId : undefined}
        retryLabel={t("common.retry")}
        onRetry={() => void ticketQuery.refetch()}
      />
    );
  }

  const pick = (p: { nameEn: string; nameTe: string }) => (locale === "te" ? p.nameTe : p.nameEn);
  const at = (iso: string) => `${formatDate(iso, locale)}, ${formatTime(iso, locale)}`;
  const route = t("common.routeFromTo", { from: pick(ticket.boarding), to: pick(ticket.dropping) });
  const statusLabel = t(TICKET_STATUS_MAP[ticket.status].i18nKey);
  const showLiveStatus = ticket.displayStatus !== "UPCOMING" && !FINAL.has(ticket.status);

  const details = [
    { label: t("ticketDetail.details.passenger"), value: ticket.passengerName ?? t("common.notAvailable") },
    { label: t("ticketDetail.details.seat"), value: ticket.seatNo ?? t("common.notAvailable") },
    { label: t("ticketDetail.details.bus"), value: ticket.busRegNo ?? t("ticketDetail.details.busPending") },
    {
      label: t("ticketDetail.details.fare"),
      value: ticket.type === "FREE_TRAVEL" ? t("ticketDetail.details.free") : formatMoney(ticket.farePaise, locale),
    },
    { label: t("ticketDetail.details.boarding"), value: pick(ticket.boarding), wide: true },
    { label: t("ticketDetail.details.destination"), value: pick(ticket.dropping), wide: true },
  ];

  const activateError = activate.error;
  const activateErrorText = activateError
    ? isApiError(activateError) && activateError.code === "ACTIVATION_WINDOW_CLOSED"
      ? t("errors.ACTIVATION_WINDOW_CLOSED", {
          time: at(String(activateError.details?.activationOpensAt ?? ticket.activationOpensAt)),
        })
      : t(errorKey(activateError, (k) => t.has(k)))
    : null;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      {offline && <OfflineBanner message={t("ticketDetail.offline")} />}

      <TicketCard
        from={pick(ticket.boarding)}
        to={pick(ticket.dropping)}
        routeLabel={route}
        when={t("ticketDetail.when", { date: formatDate(ticket.departureAt, locale), time: formatTime(ticket.departureAt, locale) })}
        status={
          <div className="flex flex-wrap items-center gap-2">
            <TicketStatusBadge status={ticket.status} label={statusLabel} />
            {showLiveStatus && (
              <StatusBadge status={ticket.displayStatus} label={t(STATUS_MAP[ticket.displayStatus].i18nKey)} size="sm" />
            )}
          </div>
        }
        details={details}
        code={ticket.code}
        codeLabel={t("ticketDetail.codeLabel")}
        copyLabel={t("ticketDetail.copy")}
        copiedLabel={t("ticketDetail.copied")}
      >
        {ticket.type === "FREE_TRAVEL" && <p className="text-small font-medium text-status-info">{t("ticketDetail.freeTicket")}</p>}
        {ticket.delayMinutes > 0 && !FINAL.has(ticket.status) && (
          <p className="text-small text-status-warning">{t("ticketDetail.delay", { minutes: ticket.delayMinutes })}</p>
        )}

        {ticket.status === "BOOKED" && <LockedQr ticket={ticket} at={at} />}

        {(ticket.status === "ACTIVE" || ticket.status === "SCANNED") &&
          (qrData ? (
            <div className={justActivated ? "w-full animate-fade-in" : "w-full"}>
              {ticket.status === "SCANNED" && <EndedPanel icon={BadgeCheck} tone="success" title={t("ticketDetail.scanned.title")} hint={t("ticketDetail.scanned.hint")} />}
              <LiveQr data={qrData} label={t("ticketDetail.qr.label", { route })} />
            </div>
          ) : ticket.status === "SCANNED" ? (
            <EndedPanel icon={BadgeCheck} tone="success" title={t("ticketDetail.scanned.title")} hint={t("ticketDetail.scanned.hint")} />
          ) : qrQuery.isError ? (
            <ErrorState
              message={t(errorKey(qrQuery.error, (k) => t.has(k)))}
              retryLabel={t("common.retry")}
              onRetry={() => void qrQuery.refetch()}
            />
          ) : (
            <Skeleton className="size-64 rounded-md" />
          ))}

        {(ticket.status === "ACTIVE" || ticket.status === "SCANNED") && ticket.validUntil && (
          <p className="text-body font-medium text-fg">{t("ticketDetail.validUntil", { time: at(ticket.validUntil) })}</p>
        )}

        {ticket.status === "USED" && (
          <EndedPanel icon={BadgeCheck} tone="neutral" title={t("ticketDetail.used.title")} hint={t("ticketDetail.used.hint")} />
        )}
        {(ticket.status === "USED" || ticket.status === "EXPIRED") && (
          <Link
            href={`/feedback?ticket=${encodeURIComponent(ticket.code)}`}
            className="inline-flex min-h-11 items-center gap-2 text-primary underline-offset-4 hover:underline"
          >
            <MessageSquare className="size-5" aria-hidden="true" />
            {t("feedbackPage.giveFeedback")}
          </Link>
        )}
        {ticket.status === "EXPIRED" && (
          <EndedPanel
            icon={Clock}
            tone="neutral"
            title={t("ticketDetail.expired.title")}
            hint={
              ticket.activatedAt && ticket.validUntil
                ? t("ticketDetail.expired.ended", { time: at(ticket.validUntil) })
                : t("ticketDetail.expired.notActivated", { time: at(ticket.activationClosesAt) })
            }
          />
        )}
        {ticket.status === "CANCELLED" && (
          <EndedPanel
            icon={XCircle}
            tone="danger"
            title={t("ticketDetail.cancelled.title")}
            hint={
              ticket.refund?.status === "FAILED"
                ? t("ticketDetail.cancelled.refundFailed")
                : ticket.refund?.status === "PROCESSED"
                  ? t("ticketDetail.cancelled.refundDone", { amount: formatMoney(ticket.refund.amountPaise, locale) })
                  : t("ticketDetail.cancelled.refundPending", { amount: formatMoney(ticket.refund?.amountPaise ?? 0, locale) })
            }
          />
        )}
        {ticket.status === "REFUNDED" && (
          <EndedPanel
            icon={RotateCcw}
            tone="neutral"
            title={t("ticketDetail.refunded.title")}
            hint={ticket.refund ? t("ticketDetail.cancelled.refundDone", { amount: formatMoney(ticket.refund.amountPaise, locale) }) : undefined}
          />
        )}
      </TicketCard>

      {/* Actions: one primary at most (docs/09), the rest in an overflow menu */}
      {ticket.status === "BOOKED" && !offline && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Button size="lg" className="flex-1" disabled={!ticket.canActivate} onClick={() => setActivateOpen(true)}>
              {t("ticket.actions.activate")}
            </Button>
            {(ticket.canGift || ticket.canCancel) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="lg" aria-label={t("ticketDetail.more")}>
                    <MoreHorizontal className="size-5" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {ticket.canGift && (
                    <DropdownMenuItem asChild>
                      <Link href={`/tickets/${id}/gift`} className="flex min-h-11 items-center gap-2">
                        <Gift className="size-4" aria-hidden="true" />
                        {t("ticket.actions.gift")}
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {ticket.canCancel && (
                    <DropdownMenuItem asChild>
                      <Link href={`/tickets/${id}/cancel`} className="flex min-h-11 items-center gap-2 text-status-danger">
                        <Ban className="size-4" aria-hidden="true" />
                        {t("ticket.actions.cancel")}
                      </Link>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      )}

      {(ticket.status === "ACTIVE" || ticket.status === "SCANNED") && (
        <Button asChild variant="secondary" size="lg">
          <Link href={`/track/${ticket.tripId}`}>
            <MapPin className="size-4" aria-hidden="true" />
            {t("ticketDetail.trackBus")}
          </Link>
        </Button>
      )}
      {ticket.status === "USED" && (
        <Button asChild variant="secondary" size="lg">
          <Link href="/feedback">
            <MessageSquare className="size-4" aria-hidden="true" />
            {t("ticketDetail.used.feedback")}
          </Link>
        </Button>
      )}

      <Sheet
        open={activateOpen}
        onOpenChange={(open) => {
          setActivateOpen(open);
          if (!open) activate.reset();
        }}
      >
        <SheetContent closeLabel={t("common.close")}>
          <SheetHeader>
            <SheetTitle>{t("ticketDetail.activateSheet.title")}</SheetTitle>
            <SheetDescription>{t("ticketDetail.activateSheet.body", { time: at(ticket.activationValidUntil) })}</SheetDescription>
          </SheetHeader>
          {activateErrorText && (
            <p role="alert" className="mt-3 text-small text-status-danger">
              {activateErrorText}
            </p>
          )}
          <SheetFooter className="mt-4 flex flex-col gap-2 pb-6 sm:flex-row-reverse">
            <Button size="lg" loading={activate.isPending} onClick={() => activate.mutate()}>
              {t("ticketDetail.activateSheet.confirm")}
            </Button>
            <Button variant="ghost" size="lg" onClick={() => setActivateOpen(false)}>
              {t("ticketDetail.activateSheet.keep")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** BOOKED: a calm locked state with the activation window in words. */
function LockedQr({ ticket, at }: { ticket: TicketDto; at: (iso: string) => string }) {
  const t = useTranslations("ticketDetail.locked");
  const now = useNow(30_000);
  const closes = Date.parse(ticket.activationClosesAt);
  const line = ticket.canActivate
    ? t("openNow", { time: at(ticket.activationClosesAt) })
    : now && now > closes
      ? t("closed", { time: at(ticket.activationClosesAt) })
      : t("opensAt", { time: at(ticket.activationOpensAt) });

  return (
    <div className="flex w-full flex-col items-center gap-3 rounded-lg bg-surface px-4 py-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-surface-raised text-muted">
        <Lock className="size-6" aria-hidden="true" />
      </span>
      <p className="text-h3 text-fg">{t("title")}</p>
      <p className="text-small text-muted">{line}</p>
    </div>
  );
}

const PANEL_TONE = {
  success: "bg-status-success-soft text-status-success",
  danger: "bg-status-danger-soft text-status-danger",
  neutral: "bg-status-neutral-soft text-status-neutral",
} as const;

function EndedPanel({
  icon: Icon,
  tone,
  title,
  hint,
}: {
  icon: typeof Clock;
  tone: keyof typeof PANEL_TONE;
  title: string;
  hint?: string;
}) {
  return (
    <div className="mb-4 flex w-full flex-col items-center gap-2 rounded-lg bg-surface px-4 py-6 text-center">
      <span className={`flex size-12 items-center justify-center rounded-full ${PANEL_TONE[tone]}`}>
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <p className="text-h3 text-fg">{title}</p>
      {hint && <p className="text-small text-muted">{hint}</p>}
    </div>
  );
}
