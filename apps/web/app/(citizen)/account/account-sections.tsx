"use client";

import {
  MeDto,
  PLATFORM_TIME_ZONE,
  type NotificationPrefs,
  type SavedRouteDto,
  SavedRoutesResponse,
  PassDto,
  SessionsResponse,
  TicketsResponse,
  type SessionDto,
  UpdateMeInput,
} from "@aptransit/shared";
import { Button, EmptyState, ErrorState, Skeleton, Switch, toast } from "@aptransit/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, CheckCircle2, CreditCard, MapPin, Smartphone, Ticket, Trash2, TriangleAlert, type LucideIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { z } from "zod";
import Link from "next/link";
import { useState } from "react";
import { ContactVerify } from "../../../components/contact-verify";
import { api, errorKey } from "../../../lib/api";
import { queryKeys } from "../../../lib/query-keys";

const ROW = "flex min-h-12 items-center justify-between gap-3 py-2";

/** Email or phone with its verified state and a way to add or change it (D-048). */
export function ContactRow({ me, channel }: { me: MeDto; channel: "EMAIL" | "PHONE" }) {
  const t = useTranslations();
  const [editing, setEditing] = useState(false);
  const value = channel === "EMAIL" ? me.email : me.phone;
  const verified = channel === "EMAIL" ? me.emailVerified : me.phoneVerified;
  const label = t(channel === "EMAIL" ? "account.profile.email" : "account.profile.phone");
  const key = channel.toLowerCase();

  return (
    <div className="flex flex-col gap-2" data-testid={`contact-${key}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="text-small text-muted">{label}</p>
          <p className="truncate text-body text-fg tabular-nums">{value ?? t("account.profile.notAdded")}</p>
        </div>
        <div className="flex items-center gap-3">
          {value ? (
            verified ? (
              <span className="inline-flex items-center gap-1 text-small text-status-success">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                {t("account.profile.verified")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-small text-status-warning">
                <TriangleAlert className="size-4" aria-hidden="true" />
                {t("account.profile.notVerified")}
              </span>
            )
          ) : null}
          {!editing ? (
            <Button variant="link" onClick={() => setEditing(true)}>
              {t(value ? "account.profile.change" : "account.profile.add")}
              <span className="sr-only"> {label}</span>
            </Button>
          ) : null}
        </div>
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          <ContactVerify channel={channel} idPrefix={`account-${key}`} onDone={() => setEditing(false)} />
          <Button variant="link" className="self-start" onClick={() => setEditing(false)}>
            {t("contact.cancel")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const PREF_KEYS = ["trips", "tickets", "passes", "complaints"] as const;

/** Which notification emails the citizen wants. In app notifications always arrive. */
export function NotificationPrefsForm({ me }: { me: MeDto }) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (notificationPrefs: NotificationPrefs) =>
      api("/me", { method: "PATCH", body: UpdateMeInput.parse({ notificationPrefs }), schema: MeDto }),
    onSuccess: (updated) => queryClient.setQueryData(queryKeys.me, updated),
    onError: (err) => toast.error(t(errorKey(err, (k) => t.has(k)))),
  });

  return (
    <div className="flex flex-col gap-1">
      <p className="text-body text-muted">{t("account.notifications.hint")}</p>
      <ul className="flex flex-col divide-y divide-hairline">
        {PREF_KEYS.map((key) => (
          <li key={key} className={ROW}>
            <label htmlFor={`pref-${key}`} className="min-w-0 flex-1 cursor-pointer text-body text-fg">
              {t(`account.notifications.${key}`)}
            </label>
            <Switch
              id={`pref-${key}`}
              checked={me.notificationPrefs.email[key]}
              disabled={save.isPending}
              onCheckedChange={(checked) =>
                save.mutate({ email: { ...me.notificationPrefs.email, [key]: checked } })
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatWhen(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: PLATFORM_TIME_ZONE }).format(new Date(iso));
}

/** A short device name from the user agent, never the raw string. */
function deviceName(userAgent: string | null, fallback: string): string {
  if (!userAgent) return fallback;
  const os = /Android/i.test(userAgent) ? "Android" : /iPhone|iPad/i.test(userAgent) ? "iOS" : /Windows/i.test(userAgent) ? "Windows" : /Mac OS/i.test(userAgent) ? "Mac" : /Linux/i.test(userAgent) ? "Linux" : null;
  const browser = /Edg\//.test(userAgent) ? "Edge" : /Chrome\//.test(userAgent) ? "Chrome" : /Firefox\//.test(userAgent) ? "Firefox" : /Safari\//.test(userAgent) ? "Safari" : null;
  return [browser, os].filter(Boolean).join(" on ") || fallback;
}

/** Signed in devices, and a way to sign every other one out. */
export function DevicesList() {
  const t = useTranslations();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const sessions = useQuery({
    queryKey: ["auth", "sessions"],
    queryFn: ({ signal }) => api("/auth/sessions", { schema: SessionsResponse, signal }),
  });
  const revoke = useMutation({
    mutationFn: () => api("/auth/sessions/revoke-others", { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["auth", "sessions"] });
      toast.success(t("account.devices.signedOut"));
    },
    onError: (err) => toast.error(t(errorKey(err, (k) => t.has(k)))),
  });

  if (sessions.isPending) return <Skeleton shape="block" className="h-20" />;
  if (sessions.isError)
    return (
      <ErrorState
        title={t("account.devices.loadFailed")}
        message={t(errorKey(sessions.error, (k) => t.has(k)))}
        retryLabel={t("common.retry")}
        onRetry={() => void sessions.refetch()}
      />
    );
  const rows: SessionDto[] = sessions.data;
  const others = rows.filter((s) => !s.current).length;

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-hairline">
        {rows.map((s) => (
          <li key={s.id} className={ROW}>
            <span className="flex min-w-0 items-center gap-3">
              <Smartphone className="size-5 shrink-0 text-muted" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block truncate text-body text-fg">{deviceName(s.userAgent, t("account.devices.unknown"))}</span>
                <span className="block text-small text-muted">{t("account.devices.lastActive", { when: formatWhen(s.lastActiveAt, locale) })}</span>
              </span>
            </span>
            {s.current ? <span className="shrink-0 text-small text-status-success">{t("account.devices.thisDevice")}</span> : null}
          </li>
        ))}
      </ul>
      {others > 0 ? (
        <Button variant="secondary" className="self-start" loading={revoke.isPending} onClick={() => revoke.mutate()}>
          {t("account.devices.signOutOthers")}
        </Button>
      ) : null}
    </div>
  );
}

/** Saved routes: tap one to search it, remove the ones you do not need. */
export function SavedRoutesList() {
  const t = useTranslations();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const routes = useQuery({
    queryKey: ["me", "saved-routes"],
    queryFn: ({ signal }) => api("/me/saved-routes", { schema: SavedRoutesResponse, signal }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/me/saved-routes/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["me", "saved-routes"] }),
    onError: (err) => toast.error(t(errorKey(err, (k) => t.has(k)))),
  });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: PLATFORM_TIME_ZONE }).format(new Date());
  const name = (s: SavedRouteDto["from"]) => (locale === "te" ? s.nameTe : s.nameEn);

  if (routes.isPending) return <Skeleton shape="block" className="h-20" />;
  if (routes.isError)
    return (
      <ErrorState
        title={t("account.savedRoutes.loadFailed")}
        message={t(errorKey(routes.error, (k) => t.has(k)))}
        retryLabel={t("common.retry")}
        onRetry={() => void routes.refetch()}
      />
    );
  if (routes.data.length === 0) return <EmptyState icon={Bookmark} title={t("account.savedRoutes.empty")} hint={t("account.savedRoutes.emptyHint")} />;

  return (
    <ul className="flex flex-col divide-y divide-hairline">
      {routes.data.map((r) => (
        <li key={r.id} className={ROW}>
          <Link
            href={`/search?from=${encodeURIComponent(r.from.id)}&to=${encodeURIComponent(r.to.id)}&date=${today}`}
            className="min-w-0 flex-1 truncate py-2 text-body text-fg hover:text-primary"
          >
            {t("account.savedRoutes.pair", { from: name(r.from), to: name(r.to) })}
          </Link>
          <Button
            variant="ghost"
            className="shrink-0"
            aria-label={t("account.savedRoutes.remove", { from: name(r.from), to: name(r.to) })}
            loading={remove.isPending && remove.variables === r.id}
            onClick={() => remove.mutate(r.id)}
          >
            <Trash2 className="size-5" aria-hidden="true" />
          </Button>
        </li>
      ))}
    </ul>
  );
}

function HubTile({ href, icon: Icon, label, count }: { href: string; icon: LucideIcon; label: string; count?: number }) {
  return (
    <li className="min-w-0">
      <Link
        href={href}
        className="flex h-full min-h-24 flex-col justify-between gap-2 rounded-lg border border-default bg-surface-raised p-3 transition-colors duration-fast hover:border-strong hover:bg-surface"
      >
        <span className="flex items-center justify-between gap-2">
          <span className="inline-flex size-10 items-center justify-center rounded-md bg-primary-soft text-primary">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          {count !== undefined ? <span className="text-h2 tabular-nums text-fg">{count}</span> : null}
        </span>
        <span className="text-body font-medium text-fg">{label}</span>
      </Link>
    </li>
  );
}

/** D-048 travel hub: what is coming up at a glance. Counts are quiet if a list cannot load. */
export function TravelHub() {
  const t = useTranslations("account.hub");
  const tickets = useQuery({
    queryKey: queryKeys.tickets("upcoming"),
    queryFn: ({ signal }) => api("/tickets", { query: { scope: "upcoming" }, schema: TicketsResponse, signal }),
  });
  const passes = useQuery({
    queryKey: queryKeys.passes,
    queryFn: ({ signal }) => api("/passes", { schema: z.array(PassDto), signal }),
  });
  const activePasses = passes.data?.filter((p) => p.status === "ACTIVE").length;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <HubTile href="/tickets" icon={Ticket} label={t("tickets")} count={tickets.data?.length} />
      <HubTile href="/passes" icon={CreditCard} label={t("passes")} count={activePasses} />
      <HubTile href="/track" icon={MapPin} label={t("track")} />
    </ul>
  );
}
