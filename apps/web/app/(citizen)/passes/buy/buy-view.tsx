"use client";

import { formatMoney, PassDto, PassTypeDto } from "@aptransit/shared";
import { Button, Card, ErrorState, Skeleton, toast } from "@aptransit/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, HeartHandshake } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { api, errorKey, isApiError } from "../../../../lib/api";
import { usePayment } from "../../../../lib/payments";
import { queryKeys } from "../../../../lib/query-keys";
import { serviceList } from "../../../../lib/service-list";

const PassTypes = z.array(PassTypeDto);

export function BuyPassView() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const payment = usePayment();
  const [selected, setSelected] = useState<string | null>(null);

  const typesQuery = useQuery({
    queryKey: queryKeys.passTypes,
    queryFn: ({ signal }) => api("/pass-types", { schema: PassTypes, signal, redirectOn401: false }),
  });

  const create = useMutation({
    mutationFn: (passTypeId: string) => api("/passes", { method: "POST", body: { passTypeId }, schema: PassDto }),
  });

  const pick = (p: { nameEn: string; nameTe: string }) => (locale === "te" ? p.nameTe : p.nameEn);

  if (typesQuery.isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4" aria-busy="true">
        <span className="sr-only" role="status">
          {t("common.loading")}
        </span>
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-36 w-full rounded-lg" />
        <Skeleton className="h-36 w-full rounded-lg" />
      </div>
    );
  }

  if (typesQuery.isError || !typesQuery.data) {
    return (
      <ErrorState
        headingLevel="h1"
        title={t("passBuy.errorTitle")}
        message={t(errorKey(typesQuery.error, (k) => t.has(k)))}
        requestId={isApiError(typesQuery.error) ? typesQuery.error.requestId : undefined}
        retryLabel={t("common.retry")}
        onRetry={() => void typesQuery.refetch()}
      />
    );
  }

  const paid = typesQuery.data.filter((type) => type.kind !== "FREE_TRAVEL");
  const free = typesQuery.data.find((type) => type.kind === "FREE_TRAVEL");
  const chosen = paid.find((type) => type.id === selected) ?? null;
  const busy = create.isPending || payment.state.phase === "working" || payment.state.phase === "checking";
  const failure = create.error ? t(errorKey(create.error, (k) => t.has(k))) : payment.state.errorKey ? t(payment.state.errorKey) : null;

  const buy = async () => {
    if (!chosen) return;
    let pass: PassDto;
    try {
      pass = await create.mutateAsync(chosen.id);
    } catch {
      return;
    }
    await payment.pay({
      passId: pass.id,
      name: t("passBuy.paymentName"),
      description: t("passBuy.paymentDescription", { name: pick(chosen) }),
      onConfirmed: () => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.passes });
        toast.success(t("passBuy.done"));
        router.push("/passes");
      },
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <h1 className="text-h1 text-fg">{t("passBuy.title")}</h1>
      <p className="text-body text-muted">{t("passBuy.intro")}</p>

      <div role="group" aria-label={t("passBuy.choose")} className="flex flex-col gap-3">
        {paid.map((type) => {
          const isSelected = type.id === selected;
          return (
            <button
              key={type.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => setSelected(type.id)}
              className={
                isSelected
                  ? "flex flex-col gap-2 rounded-lg border-2 border-primary bg-primary-soft p-4 text-left transition-colors duration-fast"
                  : "flex flex-col gap-2 rounded-lg border border-default bg-surface-raised p-4 text-left transition-colors duration-fast hover:border-strong"
              }
            >
              <span className="flex w-full items-start justify-between gap-3">
                <span className="text-h3 text-fg">{pick(type)}</span>
                <span className="flex items-center gap-2">
                  <span className="text-h3 tabular-nums text-fg">{formatMoney(type.pricePaise, locale)}</span>
                  {isSelected && <Check className="size-5 text-primary" aria-hidden="true" />}
                </span>
              </span>
              <span className="text-small text-muted">{t("passBuy.validity", { days: type.durationDays })}</span>
              <span className="text-small text-muted">{t("passBuy.services", { services: serviceList(type.eligibleServiceTypes, t, locale) })}</span>
            </button>
          );
        })}
      </div>

      {failure && (
        <p role="alert" className="text-small text-status-danger">
          {failure}
        </p>
      )}

      <Button size="lg" disabled={!chosen} loading={busy} onClick={() => void buy()}>
        {chosen ? t("passBuy.pay", { amount: formatMoney(chosen.pricePaise, locale) }) : t("passBuy.choose")}
      </Button>

      {free && (
        <Card padding="md" className="flex flex-col gap-2">
          <h2 className="flex items-center gap-2 text-h3 text-fg">
            <HeartHandshake className="size-5 text-primary" aria-hidden="true" />
            {t("passBuy.freeTitle")}
          </h2>
          <p className="text-small text-muted">{t("passBuy.freeHint")}</p>
          <Button asChild variant="secondary">
            <Link href="/free-travel">
              {t("passBuy.freeCta")}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </Card>
      )}
    </div>
  );
}
