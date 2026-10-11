"use client";

import {
  EligibilityCheckDto,
  EligibilityStatusDto,
  formatMoney,
  PassDto,
  type PlaceDto,
  PassTypeDto,
  type StudentCheckInput,
} from "@aptransit/shared";
import { Button, Card, Checkbox, ErrorState, Field, Input, Skeleton, ToneChip, toast } from "@aptransit/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, CircleAlert, FlaskConical, GraduationCap } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import { z } from "zod";
import { PlaceCombobox } from "../../../../components/place-combobox";
import { api, errorKey, isApiError } from "../../../../lib/api";
import { usePayment } from "../../../../lib/payments";
import { queryKeys } from "../../../../lib/query-keys";
import { useNow } from "../../../../lib/use-browser-state";

const PassTypes = z.array(PassTypeDto);
type FormErrors = Partial<Record<"consent" | "isStudent" | "institution", string>>;

/**
 * D-036 school pass: a STUDENT eligibility check (declaration only, the institution name is never
 * stored), then the home and school stops (the pass works on routes with both), then payment.
 */
export function SchoolPassView() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const payment = usePayment();
  const summaryRef = useRef<HTMLDivElement>(null);
  const [consent, setConsent] = useState(false);
  const [isStudent, setIsStudent] = useState(false);
  const [institution, setInstitution] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [result, setResult] = useState<EligibilityCheckDto | null>(null);
  const [home, setHome] = useState<PlaceDto | null>(null);
  const [dest, setDest] = useState<PlaceDto | null>(null);
  const [stopError, setStopError] = useState<string | null>(null);
  const now = useNow(60_000);

  const eligibilityQuery = useQuery({
    queryKey: queryKeys.eligibility,
    queryFn: ({ signal }) => api("/eligibility", { schema: EligibilityStatusDto, signal }),
  });
  const typesQuery = useQuery({
    queryKey: queryKeys.passTypes,
    queryFn: ({ signal }) => api("/pass-types", { schema: PassTypes, signal, redirectOn401: false }),
  });
  const check = useMutation({
    mutationFn: (body: StudentCheckInput) => api("/eligibility/student", { method: "POST", body, schema: EligibilityCheckDto }),
    onSuccess: (dto) => {
      setResult(dto);
      void queryClient.invalidateQueries({ queryKey: queryKeys.eligibility });
    },
  });
  const schoolType = typesQuery.data?.find((type) => type.kind === "SCHOOL");
  const create = useMutation({
    mutationFn: (body: { passTypeId: string; homeStopId: string; destStopId: string }) => api("/passes", { method: "POST", body, schema: PassDto }),
  });

  if (eligibilityQuery.isLoading || typesQuery.isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4" aria-busy="true">
        <span className="sr-only" role="status">
          {t("common.loading")}
        </span>
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }
  const failed = eligibilityQuery.error ?? typesQuery.error;
  if (failed || !schoolType) {
    return (
      <ErrorState
        headingLevel="h1"
        title={t("schoolPass.errorTitle")}
        message={t(errorKey(failed, (k) => t.has(k)))}
        requestId={isApiError(failed) ? failed.requestId : undefined}
        retryLabel={t("common.retry")}
        onRetry={() => {
          void eligibilityQuery.refetch();
          void typesQuery.refetch();
        }}
      />
    );
  }

  const stored = eligibilityQuery.data?.find((c) => c.scheme === "STUDENT") ?? null;
  const storedValid = stored?.result === "ELIGIBLE" && now > 0 && Date.parse(stored.expiresAt) > now ? stored : null;
  const shown = result ?? storedValid;
  const amount = formatMoney(schoolType.pricePaise, locale);
  const busy = create.isPending || payment.state.phase === "working" || payment.state.phase === "checking";
  const buyFailure = create.error ? t(errorKey(create.error, (k) => t.has(k))) : payment.state.errorKey ? t(payment.state.errorKey) : null;

  const intro = (
    <Card padding="md" className="flex flex-col gap-3">
      <p className="flex items-start gap-2 text-body text-fg">
        <GraduationCap className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        {t("schoolPass.intro")}
      </p>
      <p className="flex items-center gap-2 text-small text-muted">
        <span className="text-h3 tabular-nums text-fg">{amount}</span>
        {t("passBuy.validity", { days: schoolType.durationDays })}
      </p>
      {schoolType.isDemo && <ToneChip tone="warning" size="sm" icon={FlaskConical} label={t("passBuy.demoPrice")} className="self-start" />}
    </Card>
  );

  if (shown?.result === "ELIGIBLE") {
    const buy = async () => {
      if (!home || !dest) return setStopError(t("schoolPass.errors.stops"));
      if (home.id === dest.id) return setStopError(t("schoolPass.errors.sameStop"));
      setStopError(null);
      let pass: PassDto;
      try {
        pass = await create.mutateAsync({ passTypeId: schoolType.id, homeStopId: home.id, destStopId: dest.id });
      } catch {
        return;
      }
      await payment.pay({
        passId: pass.id,
        name: t("passBuy.paymentName"),
        description: t("passBuy.paymentDescription", { name: locale === "te" ? schoolType.nameTe : schoolType.nameEn }),
        onConfirmed: () => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.passes });
          toast.success(t("schoolPass.done"));
          router.push("/passes");
        },
      });
    };
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <h1 className="text-h1 text-fg">{t("schoolPass.title")}</h1>
        {intro}
        <Card padding="md" className="flex flex-col gap-4">
          <p className="flex items-center gap-2 text-body text-fg" role="status">
            <BadgeCheck className="size-5 text-status-success" aria-hidden="true" />
            {t("schoolPass.eligibleTitle")}
          </p>
          <h2 className="text-h3 text-fg">{t("schoolPass.stopsTitle")}</h2>
          <p className="text-small text-muted">{t("schoolPass.stopsHint")}</p>
          <PlaceCombobox id="school-home" label={t("schoolPass.homeLabel")} placeholder={t("schoolPass.placeholder")} value={home} onChange={setHome} icon="from" />
          <PlaceCombobox id="school-dest" label={t("schoolPass.destLabel")} placeholder={t("schoolPass.placeholder")} value={dest} onChange={setDest} icon="to" />
          {(stopError ?? buyFailure) && (
            <p role="alert" className="text-small text-status-danger">
              {stopError ?? buyFailure}
            </p>
          )}
          <Button size="lg" loading={busy} onClick={() => void buy()}>
            {t("passBuy.pay", { amount })}
          </Button>
        </Card>
      </div>
    );
  }

  if (shown?.result === "NOT_ELIGIBLE") {
    const reasonKey = `schoolPass.reasons.${shown.reasonCode ?? "OTHER"}`;
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <h1 className="text-h1 text-fg">{t("schoolPass.title")}</h1>
        <Card padding="md" className="flex flex-col items-center gap-3 text-center" role="status">
          <span className="flex size-12 items-center justify-center rounded-full bg-status-warning-soft text-status-warning">
            <CircleAlert className="size-6" aria-hidden="true" />
          </span>
          <h2 className="text-h2 text-fg">{t("schoolPass.notEligibleTitle")}</h2>
          <p className="text-body text-muted">{t.has(reasonKey) ? t(reasonKey) : t("schoolPass.reasons.OTHER")}</p>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
            <Button size="lg" onClick={() => setResult(null)}>
              {t("schoolPass.checkAgain")}
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href="/passes/buy">{t("schoolPass.otherPasses")}</Link>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: FormErrors = {};
    if (!consent) next.consent = t("schoolPass.errors.consent");
    if (!isStudent) next.isStudent = t("schoolPass.errors.isStudent");
    if (institution.trim().length < 2) next.institution = t("schoolPass.errors.institution");
    setErrors(next);
    if (Object.keys(next).length > 0) {
      summaryRef.current?.focus();
      return;
    }
    // Only the declaration. The API refuses any other key, so no ID number can be sent.
    check.mutate({ consent, declaration: { isStudent, institutionName: institution.trim() } });
  };
  const errorList = Object.values(errors);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <h1 className="text-h1 text-fg">{t("schoolPass.title")}</h1>
      {intro}
      <Card padding="md">
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <h2 className="text-h3 text-fg">{t("schoolPass.formTitle")}</h2>
          <div ref={summaryRef} tabIndex={-1} className="outline-none">
            {errorList.length > 0 && (
              <div role="alert" className="rounded-md bg-status-danger-soft p-3 text-small text-status-danger">
                <p className="font-medium">{t("schoolPass.errorSummary")}</p>
                <ul className="mt-1 list-disc pl-5">
                  {errorList.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <label className="flex min-h-11 cursor-pointer items-start gap-3">
            <Checkbox checked={consent} onCheckedChange={(value) => setConsent(value === true)} isError={Boolean(errors.consent)} className="mt-0.5" />
            <span className="text-body text-fg">{t("schoolPass.consent")}</span>
          </label>
          <label className="flex min-h-11 cursor-pointer items-start gap-3">
            <Checkbox checked={isStudent} onCheckedChange={(value) => setIsStudent(value === true)} isError={Boolean(errors.isStudent)} className="mt-0.5" />
            <span className="text-body text-fg">{t("schoolPass.isStudent")}</span>
          </label>
          <Field id="school-institution" label={t("schoolPass.institution")} hint={t("schoolPass.institutionHint")} error={errors.institution}>
            <Input value={institution} maxLength={120} autoComplete="organization" onChange={(e) => setInstitution(e.target.value)} isError={Boolean(errors.institution)} />
          </Field>
          {check.error && (
            <p role="alert" className="text-small text-status-danger">
              {t(errorKey(check.error, (k) => t.has(k)))}
            </p>
          )}
          <Button type="submit" size="lg" loading={check.isPending}>
            {t("schoolPass.submit")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
