"use client";
import { KpiTile } from "@aptransit/ui";
import { ChevronRight, Radio } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useNow } from "../../lib/use-browser-state";
import { useSocketConnected } from "../../lib/socket";

/** "Live, updated 5 s ago" from the time the data last arrived. */
export function LiveIndicator({ updatedAt }: { updatedAt: number }) {
  const t = useTranslations("govApp"),
    now = useNow(),
    connected = useSocketConnected();
  const seconds = updatedAt && now ? Math.max(0, Math.round((now - updatedAt) / 1000)) : null;
  return (
    <p className="inline-flex min-h-11 items-center gap-2 text-small text-muted" aria-live="off">
      <Radio className={connected ? "size-4 text-status-success" : "size-4 text-muted"} aria-hidden="true" />
      {seconds === null ? t("connecting") : t("liveUpdated", { seconds })}
    </p>
  );
}

export interface Crumb {
  href?: string;
  label: string;
}

/** Andhra Pradesh, District, Depot, Route, Trip (plan sec 36). The last crumb is the current page. */
export function GovBreadcrumb({ items }: { items: Crumb[] }) {
  const t = useTranslations("govApp");
  return (
    <nav aria-label={t("breadcrumb")}>
      <ol className="flex flex-wrap items-center gap-1 text-small">
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`} className="inline-flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRight className="size-4 text-muted" aria-hidden="true" />}
            {c.href && i < items.length - 1 ? (
              <Link href={c.href} className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline">
                {c.label}
              </Link>
            ) : (
              <span aria-current={i === items.length - 1 ? "page" : undefined} className="min-w-0 break-words">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export interface Kpi {
  id: string;
  value: number | null;
  /** Percent values get a % sign, money arrives already formatted. */
  format?: "number" | "percent";
}

/** One row of KPI tiles; numbers in the user's locale, tabular. */
export function GovKpiRow({ items, loading }: { items: Kpi[]; loading: boolean }) {
  const t = useTranslations("govApp.kpi"),
    locale = useLocale();
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
      {items.map((k) => (
        <KpiTile
          key={k.id}
          label={t(k.id)}
          value={k.value === null ? "" : k.format === "percent" ? `${nf.format(k.value)}%` : nf.format(k.value)}
          loading={loading}
        />
      ))}
    </div>
  );
}

export const placeName = (locale: string, p: { nameEn: string; nameTe: string } | undefined) =>
  p ? (locale === "te" ? p.nameTe : p.nameEn) : "";
