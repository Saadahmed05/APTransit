"use client";
import { FeedbackCategory, FeedbackCreatedDto, FeedbackInput } from "@aptransit/shared";
import { Button, Field, Input, Textarea, toast } from "@aptransit/ui";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { useMe } from "../../../components/auth-provider";
import { api, errorKey } from "../../../lib/api";

const MAX = 2000;
const CATEGORIES = FeedbackCategory.options;

/** /feedback (plan sec 40): email, category chips, message with a counter, optional trip details. */
export function FeedbackForm({ ticketCode }: { ticketCode?: string }) {
  const t = useTranslations("feedbackPage"),
    all = useTranslations(),
    me = useMe();
  const [email, setEmail] = useState<string | null>(null);
  const [category, setCategory] = useState<FeedbackCategory | null>(null);
  const [message, setMessage] = useState("");
  const [details, setDetails] = useState({ ticketCode: ticketCode ?? "", busRegNo: "", routeCode: "", travelDate: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const shownEmail = email ?? me.data?.email ?? "";

  const send = useMutation({
    mutationFn: (body: FeedbackInput) => api("/feedback", { method: "POST", body, schema: FeedbackCreatedDto, redirectOn401: false }),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = FeedbackInput.safeParse({ email: shownEmail, category: category ?? undefined, message, ...details });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "message");
        next[field] ??= t(`errors.${field}`);
      }
      setErrors(next);
      document.getElementById(`fb-${Object.keys(next)[0]}`)?.focus();
      return;
    }
    setErrors({});
    send.mutate(parsed.data);
  };

  if (send.data) {
    const code = send.data.code;
    return (
      <section className="flex flex-col items-start gap-4 rounded-lg border border-default bg-surface p-6" aria-labelledby="fb-done">
        <CheckCircle2 className="size-10 text-status-success" aria-hidden="true" />
        <h2 id="fb-done" className="text-h2">
          {t("sentTitle")}
        </h2>
        <p>{t("sentBody")}</p>
        <p className="text-h1 tabular-nums" aria-label={t("codeLabel", { code })}>
          {code}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              void navigator.clipboard?.writeText(code).then(() => toast.success(t("copied")));
            }}
          >
            <Copy className="size-5" aria-hidden="true" />
            {t("copy")}
          </Button>
          <Link
            className="inline-flex min-h-11 items-center rounded-md px-4 text-primary underline-offset-4 hover:underline"
            href={`/feedback/status?code=${encodeURIComponent(code)}`}
          >
            {t("trackStatus")}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5">
      <Field id="fb-email" label={t("email")} hint={t("emailHint")} error={errors.email} required>
        <Input type="email" autoComplete="email" value={shownEmail} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <fieldset className="flex flex-col gap-2" aria-describedby={errors.category ? "fb-category-error" : undefined}>
        <legend className="text-body font-medium">
          {t("category")} <span className="text-status-danger" aria-hidden="true">*</span>
        </legend>
        <div className="flex flex-wrap gap-2" id="fb-category" tabIndex={-1}>
          {CATEGORIES.map((c) => (
            <label
              key={c}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-default px-4 has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:text-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary"
            >
              <input type="radio" name="category" value={c} className="sr-only" checked={category === c} onChange={() => setCategory(c)} />
              {t(`categories.${c}`)}
            </label>
          ))}
        </div>
        {errors.category && (
          <p id="fb-category-error" role="alert" className="text-small text-status-danger">
            {errors.category}
          </p>
        )}
      </fieldset>
      <Field id="fb-message" label={t("message")} error={errors.message} required hint={t("counter", { count: message.length, max: MAX })}>
        <Textarea rows={6} maxLength={MAX} value={message} onChange={(e) => setMessage(e.target.value)} />
      </Field>
      <details className="rounded-lg border border-default bg-surface p-4" open={Boolean(ticketCode)}>
        <summary className="min-h-11 cursor-pointer content-center font-medium">{t("addTripDetails")}</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field id="fb-ticketCode" label={t("ticketCode")} hint={t("ticketCodeHint")} error={errors.ticketCode}>
            <Input value={details.ticketCode} onChange={(e) => setDetails({ ...details, ticketCode: e.target.value })} />
          </Field>
          <Field id="fb-busRegNo" label={t("busRegNo")} error={errors.busRegNo}>
            <Input value={details.busRegNo} onChange={(e) => setDetails({ ...details, busRegNo: e.target.value })} />
          </Field>
          <Field id="fb-routeCode" label={t("routeCode")} error={errors.routeCode}>
            <Input value={details.routeCode} onChange={(e) => setDetails({ ...details, routeCode: e.target.value })} />
          </Field>
          <Field id="fb-travelDate" label={t("travelDate")} error={errors.travelDate}>
            <Input type="date" value={details.travelDate} onChange={(e) => setDetails({ ...details, travelDate: e.target.value })} />
          </Field>
        </div>
      </details>
      {send.isError && (
        <p role="alert" className="text-status-danger">
          {all(errorKey(send.error, (k) => all.has(k)))}
        </p>
      )}
      <Button type="submit" disabled={send.isPending} aria-busy={send.isPending} className="self-start">
        {send.isPending ? t("sending") : t("submit")}
      </Button>
    </form>
  );
}
