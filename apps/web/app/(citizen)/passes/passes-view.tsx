"use client";

import { type CountdownParts, formatDate, formatMoney, formatTime, PassDto, PassQrDto } from "@aptransit/shared";
import {
  Button,
  Card,
  Countdown,
  EmptyState,
  ErrorState,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  toast,
  ToneChip,
} from "@aptransit/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, CircleDashed, Clock, CreditCard, Plus, Ticket, XCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { z } from "zod";
import { LiveQr } from "../../../components/live-qr";
import { api, errorKey, isApiError } from "../../../lib/api";
import { usePayment } from "../../../lib/payments";
import { serverOffsetMs } from "../../../lib/qr-code";
import { queryKeys } from "../../../lib/query-keys";
import { serviceList } from "../../../lib/service-list";
import { useNow } from "../../../lib/use-browser-state";

const PassList = z.array(PassDto);

const STATUS_TONE = {
  PENDING_PAYMENT: { tone: "warning", icon: Clock },
  READY: { tone: "neutral", icon: CircleDashed },
  ACTIVE: { tone: "info", icon: BadgeCheck },
  EXPIRED: { tone: "neutral", icon: Clock },
  CANCELLED: { tone: "danger", icon: XCircle },
} as const;

export function PassesView() {
  const t = useTranslations();
  const now = useNow(60_000);
  const query = useQuery({
    queryKey: queryKeys.passes,
    queryFn: ({ signal }) => api("/passes", { schema: PassList, signal }),
    refetchOnWindowFocus: true,
  });

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-h1 text-fg">{t("passes.title")}</h1>
      <Button asChild variant="secondary">
        <Link href="/passes/buy">
          <Plus className="size-4" aria-hidden="true" />
          {t("passes.buy")}
        </Link>
      </Button>
    </div>
  );

  if (query.isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4" aria-busy="true">
        <span className="sr-only" role="status">
          {t("common.loading")}
        </span>
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-96 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-lg" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        {header}
        <ErrorState
          title={t("passes.errorTitle")}
          message={t(errorKey(query.error, (k) => t.has(k)))}
          requestId={isApiError(query.error) ? query.error.requestId : undefined}
          retryLabel={t("common.retry")}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  const passes = query.data;
  const live = (p: PassDto) => p.status === "ACTIVE" && p.validUntil !== null && (!now || Date.parse(p.validUntil) > now);
  const active = passes.filter(live);
  const waiting = passes.filter((p) => p.status === "READY" || p.status === "PENDING_PAYMENT");
  const history = passes.filter((p) => !live(p) && p.status !== "READY" && p.status !== "PENDING_PAYMENT");

  if (passes.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <h1 className="text-h1 text-fg">{t("passes.title")}</h1>
        <EmptyState
          icon={Ticket}
          title={t("passes.emptyTitle")}
          hint={t("passes.emptyHint")}
          action={
            <Button asChild>
              <Link href="/passes/buy">{t("passes.buy")}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      {header}
      {active.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="passes-active">
          <h2 id="passes-active" className="text-h2 text-fg">
            {t("passes.activeHeading")}
          </h2>
          {active.map((pass) => (
            <ActivePassCard key={pass.id} pass={pass} />
          ))}
        </section>
      )}
      {waiting.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="passes-ready">
          <h2 id="passes-ready" className="text-h2 text-fg">
            {t("passes.readyHeading")}
          </h2>
          {waiting.map((pass) => (
            <WaitingPassCard key={pass.id} pass={pass} blocked={active.some((a) => a.kind === pass.kind)} />
          ))}
        </section>
      )}
      {history.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="passes-history">
          <h2 id="passes-history" className="text-h2 text-fg">
            {t("passes.historyHeading")}
          </h2>
          {history.map((pass) => (
            <PassSummary key={pass.id} pass={pass} />
          ))}
        </section>
      )}
    </div>
  );
}

function usePassText() {
  const t = useTranslations();
  const locale = useLocale();
  const pick = (p: { nameEn: string; nameTe: string }) => (locale === "te" ? p.nameTe : p.nameEn);
  const at = (iso: string) => `${formatDate(iso, locale)}, ${formatTime(iso, locale)}`;
  return { t, locale, pick, at };
}

function StatusChip({ pass }: { pass: PassDto }) {
  const { t } = usePassText();
  const meta = STATUS_TONE[pass.status];
  return <ToneChip tone={meta.tone} icon={meta.icon} label={t(`passes.status.${pass.status}`)} size="sm" />;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The active pass: name, validity, countdown, the live QR and where it is valid. */
function ActivePassCard({ pass }: { pass: PassDto }) {
  const { t, locale, pick, at } = usePassText();
  const qr = useQuery({
    queryKey: queryKeys.passQr(pass.id),
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      const data = await api(`/passes/${pass.id}/qr`, { schema: PassQrDto, signal });
      return { ...data, serverOffsetMs: serverOffsetMs(data.serverTime, Date.now()) };
    },
  });
  const format = (p: CountdownParts) =>
    p.showSeconds
      ? t("passes.countdownShort", { hours: pad(p.hours), minutes: pad(p.minutes), seconds: pad(p.seconds) })
      : t("passes.countdownLong", { days: p.days, hours: pad(p.hours), minutes: pad(p.minutes) });
  const summary = (p: CountdownParts) => t("passes.countdownSummary", { days: p.days, hours: p.hours, minutes: p.minutes });

  return (
    <article className="flex flex-col gap-4 rounded-xl border border-default bg-surface-raised p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-h3 text-fg">{pick(pass)}</h3>
        <StatusChip pass={pass} />
      </div>
      <dl className="grid gap-1 text-small text-muted">
        {pass.validFrom && <dd>{t("passes.validFrom", { time: at(pass.validFrom) })}</dd>}
        {pass.validUntil && <dd>{t("passes.validUntil", { time: at(pass.validUntil) })}</dd>}
      </dl>
      {pass.validUntil && (
        <div className="flex flex-col gap-1">
          <p className="text-caption text-muted">{t("pass.timeLeft")}</p>
          <Countdown until={pass.validUntil} format={format} summary={summary} doneLabel={t("passes.ended")} className="text-h2 text-fg" />
        </div>
      )}
      <div className="flex flex-col items-center gap-2 border-t border-dashed border-default pt-4">
        {qr.data?.rotSecret ? (
          <LiveQr
            data={{ token: qr.data.token, rotSecret: qr.data.rotSecret, periodSec: qr.data.periodSec, serverOffsetMs: qr.data.serverOffsetMs }}
            label={t("passes.qrLabel", { name: pick(pass) })}
          />
        ) : qr.isError ? (
          <ErrorState message={t(errorKey(qr.error, (k) => t.has(k)))} retryLabel={t("common.retry")} onRetry={() => void qr.refetch()} />
        ) : (
          <Skeleton className="size-64 rounded-md" />
        )}
        <p className="text-center text-small text-muted">{t("passes.showOnBoard")}</p>
      </div>
      <p className="text-small text-muted">{t("passes.services", { services: serviceList(pass.eligibleServiceTypes, t, locale) })}</p>
    </article>
  );
}

/** READY (activate, with a confirmation) or PENDING_PAYMENT (pay again). */
function WaitingPassCard({ pass, blocked }: { pass: PassDto; blocked: boolean }) {
  const { t, locale, pick, at } = usePassText();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const payment = usePayment();
  const activate = useMutation({
    mutationFn: () => api(`/passes/${pass.id}/activate`, { method: "POST", schema: PassDto }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.passes });
      setOpen(false);
      toast.success(t("passes.activated"));
    },
  });

  return (
    <Card padding="md" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-h3 text-fg">{pick(pass)}</h3>
        <StatusChip pass={pass} />
      </div>
      <p className="text-small text-muted">{t("passes.services", { services: serviceList(pass.eligibleServiceTypes, t, locale) })}</p>

      {pass.status === "READY" ? (
        <>
          <p className="text-small text-muted">{t("passes.activateBy", { time: at(pass.activateBy) })}</p>
          {blocked && <p className="text-small text-status-warning">{t("passes.activateBlocked")}</p>}
          <Button size="lg" disabled={!pass.canActivate} onClick={() => setOpen(true)}>
            {t("passes.activate")}
          </Button>
        </>
      ) : (
        <>
          <p className="text-small text-status-warning">{t("passes.pendingHint")}</p>
          {payment.state.errorKey && (
            <p role="alert" className="text-small text-status-danger">
              {t(payment.state.errorKey)}
            </p>
          )}
          <Button
            size="lg"
            loading={payment.state.phase === "working" || payment.state.phase === "checking"}
            leftIcon={<CreditCard className="size-4" aria-hidden="true" />}
            onClick={() =>
              void payment.pay({
                passId: pass.id,
                name: t("passBuy.paymentName"),
                description: t("passBuy.paymentDescription", { name: pick(pass) }),
                onConfirmed: () => {
                  void queryClient.invalidateQueries({ queryKey: queryKeys.passes });
                  toast.success(t("passBuy.done"));
                },
              })
            }
          >
            {t("passes.payNow", { amount: formatMoney(pass.pricePaise, locale) })}
          </Button>
        </>
      )}

      <Sheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) activate.reset();
        }}
      >
        <SheetContent closeLabel={t("common.close")}>
          <SheetHeader>
            <SheetTitle>{t("passes.activateTitle")}</SheetTitle>
            <SheetDescription>{t("passes.activateBody", { time: at(pass.activationValidUntil) })}</SheetDescription>
          </SheetHeader>
          {activate.error && (
            <p role="alert" className="mt-3 text-small text-status-danger">
              {t(errorKey(activate.error, (k) => t.has(k)))}
            </p>
          )}
          <SheetFooter className="mt-4 flex flex-col gap-2 pb-6 sm:flex-row-reverse">
            <Button size="lg" loading={activate.isPending} onClick={() => activate.mutate()}>
              {t("passes.activateConfirm")}
            </Button>
            <Button variant="ghost" size="lg" onClick={() => setOpen(false)}>
              {t("passes.activateKeep")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </Card>
  );
}

function PassSummary({ pass }: { pass: PassDto }) {
  const { t, pick, at } = usePassText();
  return (
    <Card padding="md" className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-body font-medium text-fg">{pick(pass)}</p>
        {pass.validUntil && <p className="text-small text-muted">{t("passes.validUntil", { time: at(pass.validUntil) })}</p>}
      </div>
      <StatusChip pass={pass} />
    </Card>
  );
}
