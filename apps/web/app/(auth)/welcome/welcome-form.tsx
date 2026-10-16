"use client";

import { MeDto, UpdateMeInput } from "@aptransit/shared";
import { Button, Card, Field, Input } from "@aptransit/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { RequireAuth } from "../../../components/require-auth";
import { useMe } from "../../../components/auth-provider";
import { ContactVerify } from "../../../components/contact-verify";
import { api, errorKey } from "../../../lib/api";
import { queryKeys } from "../../../lib/query-keys";
import { needsProfile } from "../../../lib/profile";
import { roleHome, safeNextPath } from "../../../lib/roles";

export function WelcomeForm({ next }: { next: string | null }) {
  return (
    <RequireAuth>
      <Welcome next={safeNextPath(next)} />
    </RequireAuth>
  );
}

function Step({ id, title, done, children }: { id: string; title: string; done: boolean; children?: ReactNode }) {
  const t = useTranslations("welcome");
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 border-t border-default pt-4">
      <h2 id={id} className="flex items-center gap-2 text-h3 text-fg">
        {done ? (
          <CheckCircle2 className="size-5 shrink-0 text-status-success" aria-hidden="true" />
        ) : (
          <Circle className="size-5 shrink-0 text-muted" aria-hidden="true" />
        )}
        {title}
        <span className="sr-only">{done ? t("done") : t("todo")}</span>
      </h2>
      {children}
    </section>
  );
}

function Welcome({ next }: { next: string | null }) {
  const t = useTranslations();
  const router = useRouter();
  const me = useMe();

  // Complete (or a staff account that never needs this): carry on to where the user was going.
  const finished = me.data ? !needsProfile(me.data) : false;
  useEffect(() => {
    if (me.data && finished) router.replace(next ?? roleHome(me.data));
  }, [me.data, finished, next, router]);

  if (!me.data || finished) {
    return (
      <Card padding="lg" aria-busy="true">
        <span role="status" className="text-body text-muted">
          {t("common.loading")}
        </span>
      </Card>
    );
  }

  const missing = new Set(me.data.missing);
  return (
    <Card padding="lg" className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 text-fg">{t("welcome.title")}</h1>
        <p className="text-body text-muted">{t("welcome.intro")}</p>
      </div>

      <Step id="welcome-name" title={t("welcome.name")} done={!missing.has("name")}>
        {missing.has("name") ? <NameStep /> : <p className="text-body text-fg">{me.data.name}</p>}
      </Step>

      <Step id="welcome-email" title={t("welcome.email")} done={!missing.has("email")}>
        {missing.has("email") ? (
          <ContactVerify channel="EMAIL" idPrefix="welcome-email" />
        ) : (
          <p className="truncate text-body text-fg">{me.data.email}</p>
        )}
      </Step>

      <Step id="welcome-phone" title={t("welcome.phone")} done={!missing.has("phone")}>
        {missing.has("phone") ? (
          <ContactVerify channel="PHONE" idPrefix="welcome-phone" />
        ) : (
          <p className="text-body text-fg tabular-nums">{me.data.phone}</p>
        )}
      </Step>
    </Card>
  );
}

function NameStep() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (input: UpdateMeInput) => api("/me", { method: "PATCH", body: input, schema: MeDto }),
    onSuccess: (updated) => queryClient.setQueryData(queryKeys.me, updated),
    onError: (err) => setError(t(errorKey(err, (k) => t.has(k)))),
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = UpdateMeInput.safeParse({ name: name.trim() });
    if (!parsed.success || !parsed.data.name) {
      setError(t("account.profile.nameInvalid"));
      return;
    }
    setError(null);
    save.mutate(parsed.data);
  };

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <Field id="welcome-name-input" label={t("account.profile.name")} error={error ?? undefined} className="min-w-0 flex-1">
        <Input
          autoComplete="name"
          maxLength={100}
          placeholder={t("account.profile.namePlaceholder")}
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
      </Field>
      <Button type="submit" className="sm:mt-8" loading={save.isPending}>
        {t("account.profile.saveName")}
      </Button>
    </form>
  );
}
