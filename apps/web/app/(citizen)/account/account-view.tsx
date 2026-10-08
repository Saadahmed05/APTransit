"use client";

import { MeDto, type Role, UpdateMeInput } from "@aptransit/shared";
import { Button, Card, ErrorState, Field, Input, RadioGroup, RadioGroupItem, Skeleton, toast } from "@aptransit/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Download, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { type FormEvent, type ReactNode, useState, useSyncExternalStore } from "react";
import { useAuth, useMe } from "../../../components/auth-provider";
import { LanguageSwitch } from "../../../components/language-switch";
import { api, errorKey } from "../../../lib/api";
import { useInstallPrompt } from "../../../lib/install-prompt";
import { writePreferenceCookie } from "../../../lib/preferences";
import { queryKeys } from "../../../lib/query-keys";
import { ROLE_HOME, sortedRoles } from "../../../lib/roles";

export function AccountView() {
  const t = useTranslations();
  const me = useMe();

  if (me.isPending) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <span className="sr-only" role="status">
          {t("common.loading")}
        </span>
        <Skeleton className="h-9 w-40" />
        <Skeleton shape="card" className="h-56" />
        <Skeleton shape="card" className="h-40" />
      </div>
    );
  }
  if (me.isError) {
    return (
      <ErrorState
        title={t("account.loadFailed")}
        message={t(errorKey(me.error, (k) => t.has(k)))}
        retryLabel={t("common.retry")}
        onRetry={() => void me.refetch()}
      />
    );
  }
  return <AccountDetails me={me.data} />;
}

function Section({ title, id, children }: { title: string; id: string; children: ReactNode }) {
  return (
    <Card padding="lg" className="flex flex-col gap-5">
      <h2 id={id} className="text-h2 text-fg">
        {title}
      </h2>
      {children}
    </Card>
  );
}

function AccountDetails({ me }: { me: MeDto }) {
  const t = useTranslations();
  const { logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const roles = sortedRoles(me);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-h1 text-fg">{t("nav.account")}</h1>

      <Section id="account-profile" title={t("account.profile.title")}>
        <NameForm me={me} />
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-small text-muted">{t("account.profile.email")}</dt>
            <dd className="truncate text-body text-fg">{me.email ?? t("account.profile.notAdded")}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-small text-muted">{t("account.profile.phone")}</dt>
            {/* The API sends the phone already masked (docs/06 MeDto) */}
            <dd className="text-body text-fg tabular-nums">{me.phone ?? t("account.profile.notAdded")}</dd>
          </div>
        </dl>
      </Section>

      <Section id="account-preferences" title={t("account.preferences.title")}>
        <div className="flex flex-col gap-2">
          <span className="text-body font-medium text-fg">{t("common.language")}</span>
          <div>
            <LanguageSwitch />
          </div>
        </div>
        <ThemeChoice />
      </Section>

      <InstallApp />

      <Section id="account-feedback" title={t("feedbackPage.title")}>
        <p className="text-body text-muted">{t("feedbackPage.accountHint")}</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/feedback" className="inline-flex min-h-11 items-center gap-2 text-primary underline-offset-4 hover:underline">
            {t("feedbackPage.giveFeedback")}
          </Link>
          <Link href="/feedback/status" className="inline-flex min-h-11 items-center gap-2 text-primary underline-offset-4 hover:underline">
            {t("feedbackPage.haveCode")}
          </Link>
        </div>
      </Section>

      {roles.length > 1 ? (
        <Section id="account-roles" title={t("account.roles.title")}>
          <p className="text-body text-muted">{t("account.roles.hint")}</p>
          <ul className="flex flex-col gap-2">
            {roles.map((role: Role) => (
              <li key={role}>
                <Link
                  href={ROLE_HOME[role]}
                  className="flex min-h-13 items-center justify-between gap-3 rounded-md border border-default px-4 py-2 transition-colors duration-fast hover:border-strong hover:bg-surface"
                >
                  <span className="min-w-0 text-body text-fg">{t(`roles.${role}`)}</span>
                  <ArrowRight className="size-5 shrink-0 text-muted" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Button
        variant="secondary"
        size="lg"
        className="self-start"
        loading={loggingOut}
        leftIcon={<LogOut className="size-5" aria-hidden="true" />}
        onClick={async () => {
          setLoggingOut(true);
          await logout();
        }}
      >
        {t("nav.logout")}
      </Button>
    </div>
  );
}

function NameForm({ me }: { me: MeDto }) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [name, setName] = useState(me.name ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (input: UpdateMeInput) => api("/me", { method: "PATCH", body: input, schema: MeDto }),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.me, updated);
      toast.success(t("account.profile.saved"));
    },
    onError: (err) => setError(t(errorKey(err, (k) => t.has(k)))),
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = UpdateMeInput.safeParse({ name: name.trim() });
    if (!parsed.success) {
      setError(t("account.profile.nameInvalid"));
      return;
    }
    setError(null);
    save.mutate(parsed.data);
  };

  const unchanged = name.trim() === (me.name ?? "");

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <Field id="account-name" label={t("account.profile.name")} error={error ?? undefined} className="min-w-0 flex-1">
        <Input
          autoComplete="name"
          maxLength={100}
          placeholder={t("account.profile.namePlaceholder")}
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
      </Field>
      <Button type="submit" variant="primary" className="sm:mt-8" loading={save.isPending} disabled={unchanged}>
        {t("account.profile.saveName")}
      </Button>
    </form>
  );
}

type ThemeValue = "light" | "dark" | "system";

function subscribeTheme(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function readTheme(): ThemeValue {
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "light" || attr === "dark" ? attr : "system";
}

function ThemeChoice() {
  const t = useTranslations("common");
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "system" as ThemeValue);

  const choose = (value: string) => {
    const next = value as ThemeValue;
    if (next === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", next);
    writePreferenceCookie("theme", next);
  };

  const options: ThemeValue[] = ["light", "dark", "system"];
  return (
    <div className="flex flex-col gap-2">
      <span id="theme-label" className="text-body font-medium text-fg">
        {t("theme")}
      </span>
      <RadioGroup value={theme} onValueChange={choose} aria-labelledby="theme-label" className="gap-1 sm:grid-cols-3">
        {options.map((value) => (
          <label
            key={value}
            htmlFor={`theme-${value}`}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-surface"
          >
            <RadioGroupItem id={`theme-${value}`} value={value} />
            <span className="text-body text-fg">{t(value)}</span>
          </label>
        ))}
      </RadioGroup>
    </div>
  );
}

/** "Install app" only when the browser offered it (beforeinstallprompt); never a pop up on load. */
function InstallApp() {
  const t = useTranslations("pwa");
  const { canInstall, install } = useInstallPrompt();
  if (!canInstall) return null;
  return (
    <Section id="account-install" title={t("installTitle")}>
      <p className="text-body text-muted">{t("installHint")}</p>
      <Button variant="secondary" className="self-start" leftIcon={<Download className="size-4" aria-hidden="true" />} onClick={() => void install()}>
        {t("install")}
      </Button>
    </Section>
  );
}
