"use client";

import { CHILD_CARD_MAX_AGE, type CreatePassInput, DistrictsResponse, formatMoney, PassDto, PassTypeDto } from "@aptransit/shared";
import { Button, Card, Checkbox, EmptyState, ErrorState, Field, Input, Skeleton, ToneChip, toast } from "@aptransit/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Baby, FlaskConical, HeartHandshake, MapPinned, Ticket, Users } from "lucide-react";
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

/**
 * /passes/buy (D-036): one card per pass with its price, validity, who it is for and one Buy
 * button. Demo prices carry a chip. The school pass goes through its eligibility flow first.
 */
export function BuyPassView() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const payment = usePayment();
  const [buying, setBuying] = useState<string | null>(null);

  const typesQuery = useQuery({
    queryKey: queryKeys.passTypes,
    queryFn: ({ signal }) =>
      api("/pass-types", { schema: PassTypes, signal, redirectOn401: false }),
  });

  // D-042: zone passes name a district; a child card names the child (the parent gets a message on boarding)
  const [zone, setZone] = useState("");
  const [forChild, setForChild] = useState(false);
  const [childName, setChildName] = useState("");
  const [childAge, setChildAge] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const districts = useQuery({
    queryKey: queryKeys.districts,
    queryFn: ({ signal }) => api("/districts", { schema: DistrictsResponse, signal, redirectOn401: false }),
  });

  const create = useMutation({
    mutationFn: (body: CreatePassInput) =>
      api("/passes", { method: "POST", body, schema: PassDto }),
  });

  const pick = (p: { nameEn: string; nameTe: string }) => (locale === "te" ? p.nameTe : p.nameEn);

  if (typesQuery.isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4" aria-busy="true">
        <span className="sr-only" role="status">
          {t("common.loading")}
        </span>
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
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
  const busy = create.isPending || payment.state.phase === "working" || payment.state.phase === "checking";
  const failure = create.error ? t(errorKey(create.error, (k) => t.has(k))) : payment.state.errorKey ? t(payment.state.errorKey) : null;

  const buy = async (type: PassTypeDto) => {
    setFormError(null);
    if (type.zoneScoped && !zone) return setFormError(t("passBuy.zoneRequired"));
    const age = Number(childAge);
    if (forChild && (!childName.trim() || !Number.isInteger(age) || age < 1 || age >= CHILD_CARD_MAX_AGE))
      return setFormError(t("passBuy.childInvalid", { max: CHILD_CARD_MAX_AGE - 1 }));
    setBuying(type.id);
    let pass: PassDto;
    try {
      pass = await create.mutateAsync({
        passTypeId: type.id,
        ...(type.zoneScoped ? { zoneDistrictId: zone } : {}),
        ...(forChild ? { child: { name: childName.trim(), age } } : {}),
      });
    } catch {
      return;
    }
    await payment.pay({
      passId: pass.id,
      name: t("passBuy.paymentName"),
      description: t("passBuy.paymentDescription", { name: pick(type) }),
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

      {/* D-042: options that apply to the pass bought below */}
      <Card padding="md" className="flex flex-col gap-3">
        <label className="flex min-h-11 items-center gap-3 text-body text-fg">
          <Checkbox checked={forChild} onCheckedChange={(v) => setForChild(v === true)} />
          <Baby className="size-5 text-primary" aria-hidden="true" />
          {t("passBuy.forChild")}
        </label>
        {forChild ? (
          <>
            <p className="text-small text-muted">{t("passBuy.childHint")}</p>
            <div className="grid grid-cols-3 gap-3">
              <Field id="child-name" label={t("passBuy.childName")} className="col-span-2">
                <Input value={childName} maxLength={100} onChange={(e) => setChildName(e.currentTarget.value)} />
              </Field>
              <Field id="child-age" label={t("passBuy.childAge")}>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={CHILD_CARD_MAX_AGE - 1}
                  value={childAge}
                  onChange={(e) => setChildAge(e.currentTarget.value)}
                />
              </Field>
            </div>
          </>
        ) : null}
        {paid.some((type) => type.zoneScoped) ? (
          <Field id="pass-zone" label={t("passBuy.zoneLabel")} hint={t("passBuy.zoneHint")}>
            <select
              value={zone}
              onChange={(e) => setZone(e.currentTarget.value)}
              className="h-11 w-full rounded-md border border-strong bg-surface-raised px-3 text-body text-fg"
            >
              <option value="">{t("passBuy.zonePick")}</option>
              {(districts.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {pick(d)}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </Card>

      {formError && (
        <p role="alert" className="text-small text-status-danger">
          {formError}
        </p>
      )}
      {failure && (
        <p role="alert" className="text-small text-status-danger">
          {failure}
        </p>
      )}

      {paid.length === 0 && !free ? (
        <EmptyState icon={Ticket} headingLevel="h2" title={t("passBuy.emptyTitle")} hint={t("passBuy.emptyHint")} />
      ) : (
        <ul className="flex flex-col gap-3" aria-label={t("passBuy.choose")}>
          {paid.map((type) => {
            const name = pick(type);
            const amount = formatMoney(type.pricePaise, locale);
            return (
              <li key={type.id}>
                <Card padding="md" className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="min-w-0 text-h3 text-fg">{name}</h2>
                    <span className="text-h3 tabular-nums text-fg">{amount}</span>
                  </div>
                  {type.zoneScoped ? (
                    <span className="inline-flex items-center gap-1 self-start rounded-full bg-status-info-soft px-2 py-0.5 text-small font-medium text-status-info">
                      <MapPinned className="size-4" aria-hidden="true" />
                      {t("passBuy.zoneBadge")}
                    </span>
                  ) : null}
                  {type.isDemo && <ToneChip tone="warning" size="sm" icon={FlaskConical} label={t("passBuy.demoPrice")} className="self-start" />}
                  <p className="text-body text-fg">{t(`passBuy.forWho.${type.kind}`)}</p>
                  <p className="text-small text-muted">
                    {type.validityMode === "UNTIL_DAY_END" ? t("passBuy.validityDay") : t("passBuy.validity", { days: type.durationDays })}
                  </p>
                  {type.groupSize > 1 && (
                    <p className="flex items-center gap-2 text-small text-fg">
                      <Users className="size-4 shrink-0" aria-hidden="true" />
                      {t("passBuy.covers", { count: type.groupSize })}
                    </p>
                  )}
                  <p className="text-small text-muted">{t("passBuy.services", { services: serviceList(type.eligibleServiceTypes, t, locale) })}</p>
                  {type.routeRestricted ? (
                    <Button asChild variant="secondary" className="mt-2">
                      <Link href="/passes/school">
                        {t("passBuy.schoolCta")}
                        <ArrowRight className="size-4" aria-hidden="true" />
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      className="mt-2"
                      aria-label={t("passBuy.buyLabel", { name, amount })}
                      loading={busy && buying === type.id}
                      disabled={busy && buying !== type.id}
                      onClick={() => void buy(type)}
                    >
                      {t("passBuy.buy", { amount })}
                    </Button>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {paid.some((type) => type.isDemo) && <p className="text-small text-muted">{t("passBuy.demoNote")}</p>}

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
