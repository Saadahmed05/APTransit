"use client";

import {
  EligibilityCheckDto,
  EligibilityStatusDto,
  formatDate,
  FreeTravelCategory,
  PassDto,
  PassTypeDto,
  PhotoIdType,
  type StreeShaktiCheckInput,
} from "@aptransit/shared";
import { Button, Card, Checkbox, ErrorState, RadioGroup, RadioGroupItem, Skeleton, toast } from "@aptransit/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, CircleAlert, IdCard, ShieldCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import { z } from "zod";
import { api, errorKey, isApiError } from "../../../lib/api";
import { queryKeys } from "../../../lib/query-keys";
import { serviceList } from "../../../lib/service-list";
import { useNow } from "../../../lib/use-browser-state";

const PassTypes = z.array(PassTypeDto);
const PassList = z.array(PassDto);
const CATEGORIES = FreeTravelCategory.options;
const ID_TYPES = PhotoIdType.options;

type FormErrors = Partial<Record<"consent" | "category" | "idType", string>>;

export function FreeTravelView() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const summaryRef = useRef<HTMLDivElement>(null);
  const [consent, setConsent] = useState(false);
  const [category, setCategory] = useState("");
  const [domicile, setDomicile] = useState(false);
  const [idType, setIdType] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [result, setResult] = useState<EligibilityCheckDto | null>(null);
  const now = useNow(60_000);

  const eligibilityQuery = useQuery({
    queryKey: queryKeys.eligibility,
    queryFn: ({ signal }) => api("/eligibility", { schema: EligibilityStatusDto, signal }),
  });
  const typesQuery = useQuery({
    queryKey: queryKeys.passTypes,
    queryFn: ({ signal }) => api("/pass-types", { schema: PassTypes, signal, redirectOn401: false }),
  });
  const passesQuery = useQuery({
    queryKey: queryKeys.passes,
    queryFn: ({ signal }) => api("/passes", { schema: PassList, signal }),
  });

  const check = useMutation({
    mutationFn: (body: StreeShaktiCheckInput) => api("/eligibility/stree-shakti", { method: "POST", body, schema: EligibilityCheckDto }),
    onSuccess: (dto) => {
      setResult(dto);
      void queryClient.invalidateQueries({ queryKey: queryKeys.eligibility });
    },
  });
  const freeType = typesQuery.data?.find((type) => type.kind === "FREE_TRAVEL");
  const getPass = useMutation({
    mutationFn: () => api("/passes", { method: "POST", body: { passTypeId: freeType!.id }, schema: PassDto }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.passes });
      toast.success(t("freeTravelPage.passReady"));
      router.push("/passes");
    },
  });

  const loading = eligibilityQuery.isLoading || typesQuery.isLoading || passesQuery.isLoading;
  const failed = eligibilityQuery.error ?? typesQuery.error ?? passesQuery.error;

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4" aria-busy="true">
        <span className="sr-only" role="status">
          {t("common.loading")}
        </span>
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-80 w-full rounded-lg" />
      </div>
    );
  }
  if (failed) {
    return (
      <ErrorState
        headingLevel="h1"
        title={t("freeTravelPage.errorTitle")}
        message={t(errorKey(failed, (k) => t.has(k)))}
        requestId={isApiError(failed) ? failed.requestId : undefined}
        retryLabel={t("common.retry")}
        onRetry={() => {
          void eligibilityQuery.refetch();
          void typesQuery.refetch();
          void passesQuery.refetch();
        }}
      />
    );
  }

  const services = freeType ? serviceList(freeType.eligibleServiceTypes, t, locale) : "";
  const stored = eligibilityQuery.data?.find((c) => c.scheme === "STREE_SHAKTI") ?? null;
  const storedValid = stored?.result === "ELIGIBLE" && now > 0 && Date.parse(stored.expiresAt) > now ? stored : null;
  const shown = result ?? storedValid;
  const hasFreePass = (passesQuery.data ?? []).some((p) => p.kind === "FREE_TRAVEL" && (p.status === "READY" || p.status === "ACTIVE"));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: FormErrors = {};
    if (!consent) next.consent = t("freeTravelPage.errors.consent");
    if (!category) next.category = t("freeTravelPage.errors.category");
    if (!idType) next.idType = t("freeTravelPage.errors.idType");
    setErrors(next);
    if (Object.keys(next).length > 0) {
      summaryRef.current?.focus();
      return;
    }
    // Only the declaration and the ID type. Never an ID number (the API refuses any other key).
    check.mutate({ consent, declaration: { category, apDomicile: domicile }, idType: idType as StreeShaktiCheckInput["idType"] });
  };

  const explainer = (
    <Card padding="md" className="flex flex-col gap-3">
      <p className="text-body text-fg">{t("freeTravelPage.intro", { services })}</p>
      <p className="flex items-start gap-2 text-small text-muted">
        <IdCard className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          <span className="font-medium text-fg">{t("freeTravelPage.idTitle")}: </span>
          {t("freeTravelPage.idText")}
        </span>
      </p>
    </Card>
  );

  if (shown?.result === "ELIGIBLE") {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <h1 className="text-h1 text-fg">{t("freeTravel.title")}</h1>
        {explainer}
        <Card padding="md" className="flex flex-col items-center gap-3 text-center" role="status">
          <span className="flex size-12 items-center justify-center rounded-full bg-status-success-soft text-status-success">
            <BadgeCheck className="size-6" aria-hidden="true" />
          </span>
          <h2 className="text-h2 text-fg">{t("freeTravelPage.eligibleTitle")}</h2>
          <p className="text-small text-muted">{t("freeTravelPage.eligibleHint", { date: formatDate(shown.expiresAt, locale) })}</p>
          {getPass.error && (
            <p role="alert" className="text-small text-status-danger">
              {t(errorKey(getPass.error, (k) => t.has(k)))}
            </p>
          )}
          {hasFreePass ? (
            <>
              <p className="text-small text-muted">{t("freeTravelPage.alreadyHave")}</p>
              <Button asChild size="lg">
                <Link href="/passes">{t("freeTravelPage.goToPasses")}</Link>
              </Button>
            </>
          ) : (
            <Button size="lg" loading={getPass.isPending} disabled={!freeType} onClick={() => getPass.mutate()}>
              {t("freeTravelPage.getPass")}
            </Button>
          )}
        </Card>
      </div>
    );
  }

  if (shown?.result === "NOT_ELIGIBLE") {
    const reasonKey = `freeTravelPage.reasons.${shown.reasonCode ?? "OTHER"}`;
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <h1 className="text-h1 text-fg">{t("freeTravel.title")}</h1>
        <Card padding="md" className="flex flex-col items-center gap-3 text-center" role="status">
          <span className="flex size-12 items-center justify-center rounded-full bg-status-warning-soft text-status-warning">
            <CircleAlert className="size-6" aria-hidden="true" />
          </span>
          <h2 className="text-h2 text-fg">{t("freeTravelPage.notEligibleTitle")}</h2>
          <p className="text-body text-muted">{t.has(reasonKey) ? t(reasonKey) : t("freeTravelPage.reasons.OTHER")}</p>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
            <Button size="lg" onClick={() => setResult(null)}>
              {t("freeTravelPage.checkAgain")}
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href="/passes/buy">{t("freeTravelPage.otherPasses")}</Link>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const errorList = Object.values(errors);
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <h1 className="text-h1 text-fg">{t("freeTravel.title")}</h1>
      {explainer}

      <Card padding="md">
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <h2 className="text-h3 text-fg">{t("freeTravelPage.formTitle")}</h2>

          <div ref={summaryRef} tabIndex={-1} className="outline-none">
            {errorList.length > 0 && (
              <div role="alert" className="rounded-md bg-status-danger-soft p-3 text-small text-status-danger">
                <p className="font-medium">{t("freeTravelPage.errorSummary")}</p>
                <ul className="mt-1 list-disc pl-5">
                  {errorList.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <label className="flex min-h-11 cursor-pointer items-start gap-3">
            <Checkbox
              checked={consent}
              onCheckedChange={(value) => setConsent(value === true)}
              isError={Boolean(errors.consent)}
              aria-describedby={errors.consent ? "consent-error" : undefined}
              className="mt-0.5"
            />
            <span className="text-body text-fg">{t("freeTravelPage.consent")}</span>
          </label>
          {errors.consent && (
            <p id="consent-error" className="-mt-3 text-small text-status-danger">
              {errors.consent}
            </p>
          )}

          <fieldset className="flex flex-col gap-2">
            <legend id="category-label" className="mb-2 text-body font-medium text-fg">
              {t("freeTravelPage.categoryLabel")}
            </legend>
            <RadioGroup value={category} onValueChange={setCategory} aria-labelledby="category-label" className="flex flex-wrap gap-2">
              {CATEGORIES.map((value) => (
                <label key={value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-strong px-3 has-[[data-state=checked]]:border-primary">
                  <RadioGroupItem value={value} isError={Boolean(errors.category)} aria-labelledby={`category-${value}`} />
                  <span id={`category-${value}`} className="text-body text-fg">
                    {t(`freeTravelPage.categories.${value}`)}
                  </span>
                </label>
              ))}
            </RadioGroup>
            {errors.category && <p className="text-small text-status-danger">{errors.category}</p>}
          </fieldset>

          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <Checkbox checked={domicile} onCheckedChange={(value) => setDomicile(value === true)} />
            <span className="text-body text-fg">{t("freeTravelPage.domicile")}</span>
          </label>

          <fieldset className="flex flex-col gap-2" aria-describedby="id-note">
            <legend id="idtype-label" className="mb-2 text-body font-medium text-fg">
              {t("freeTravelPage.idTypeLabel")}
            </legend>
            <p id="id-note" className="flex items-start gap-2 text-small text-muted">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {t("freeTravelPage.idNote")}
            </p>
            <RadioGroup value={idType} onValueChange={setIdType} aria-labelledby="idtype-label" className="flex flex-wrap gap-2">
              {ID_TYPES.map((value) => (
                <label key={value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-strong px-3 has-[[data-state=checked]]:border-primary">
                  <RadioGroupItem value={value} isError={Boolean(errors.idType)} aria-labelledby={`idtype-${value}`} />
                  <span id={`idtype-${value}`} className="text-body text-fg">
                    {t(`freeTravelPage.idTypes.${value}`)}
                  </span>
                </label>
              ))}
            </RadioGroup>
            {errors.idType && <p className="text-small text-status-danger">{errors.idType}</p>}
          </fieldset>

          {check.error && (
            <p role="alert" className="text-small text-status-danger">
              {t(errorKey(check.error, (k) => t.has(k)))}
            </p>
          )}
          <Button type="submit" size="lg" loading={check.isPending}>
            {t("freeTravelPage.submit")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
