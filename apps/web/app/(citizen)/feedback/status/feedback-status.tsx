"use client";
import { ComplaintStatus, formatDate, FeedbackStatusDto, FeedbackStatusQuery } from "@aptransit/shared";
import { Button, Field, Input, Skeleton } from "@aptransit/ui";
import { useQuery } from "@tanstack/react-query";
import { Check, Circle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useMe } from "../../../../components/auth-provider";
import { api, errorKey } from "../../../../lib/api";

const STEPS = ComplaintStatus.options;

/** /feedback/status: lookup by code and email, then a status timeline (plan sec 41). */
export function FeedbackStatus({ initialCode }: { initialCode: string }) {
  const t = useTranslations("feedbackPage"),
    all = useTranslations(),
    locale = useLocale(),
    me = useMe();
  const [code, setCode] = useState(initialCode);
  const [email, setEmail] = useState<string | null>(null);
  const [query, setQuery] = useState<FeedbackStatusQuery | null>(null);
  const [invalid, setInvalid] = useState(false);
  const shownEmail = email ?? me.data?.email ?? "";

  const status = useQuery({
    enabled: query !== null,
    queryKey: ["feedback-status", query],
    queryFn: ({ signal }) => api("/feedback/status", { query: query!, schema: FeedbackStatusDto, signal, redirectOn401: false }),
    retry: false,
  });

  const lookup = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = FeedbackStatusQuery.safeParse({ code, email: shownEmail });
    setInvalid(!parsed.success);
    if (parsed.success) setQuery(parsed.data);
  };

  const data = status.data;
  const reached = data ? STEPS.indexOf(data.status) : -1;
  const dateOf = (step: ComplaintStatus) =>
    !data ? null : step === "RECEIVED" ? data.createdAt : step === "RESOLVED" ? data.resolvedAt : step === data.status ? data.updatedAt : null;

  return (
    <div className="flex flex-col gap-6">
      <form noValidate onSubmit={lookup} className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <Field id="st-code" label={t("code")} hint={t("codeHint")} className="flex-1">
          <Input value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" />
        </Field>
        <Field id="st-email" label={t("email")} className="flex-1">
          <Input type="email" autoComplete="email" value={shownEmail} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Button type="submit">{t("check")}</Button>
      </form>
      {invalid && (
        <p role="alert" className="text-status-danger">
          {t("lookupInvalid")}
        </p>
      )}
      {status.isFetching && <Skeleton className="h-40 w-full" />}
      {status.isError && (
        <p role="alert" className="text-status-danger">
          {all(errorKey(status.error, (k) => all.has(k)))}
        </p>
      )}
      {data && !status.isFetching && (
        <section aria-labelledby="st-title" className="flex flex-col gap-4 rounded-lg border border-default bg-surface p-6">
          <h2 id="st-title" className="text-h2">
            {t("statusOf", { code: data.code })}
          </h2>
          <p className="text-small text-muted">{t(`categories.${data.category}`)}</p>
          <ol className="flex flex-col gap-3">
            {STEPS.map((step, i) => {
              const done = i <= reached;
              const when = dateOf(step);
              return (
                <li key={step} className="flex items-center gap-3" aria-current={step === data.status ? "step" : undefined}>
                  <span
                    className={
                      done
                        ? "flex size-8 items-center justify-center rounded-full bg-status-success-solid text-on-solid"
                        : "flex size-8 items-center justify-center rounded-full border border-default text-muted"
                    }
                  >
                    {done ? <Check className="size-5" aria-hidden="true" /> : <Circle className="size-3" aria-hidden="true" />}
                  </span>
                  <span className={done ? "font-medium" : "text-muted"}>
                    {t(`statuses.${step}`)}
                    {done ? "" : ` (${t("notYet")})`}
                  </span>
                  {done && when && <span className="text-small text-muted">{formatDate(when, locale)}</span>}
                </li>
              );
            })}
          </ol>
          {data.resolutionNote && (
            <div className="rounded-md bg-surface-raised p-4">
              <h3 className="text-h3">{t("resolutionNote")}</h3>
              <p className="break-words">{data.resolutionNote}</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
