"use client";
import {
  BusAnalyticsDto,
  DelayAnalyticsDto,
  DemandBandDto,
  formatMoney,
  PassengerAnalyticsDto,
  RouteAnalyticsDto,
} from "@aptransit/shared";
import { DataTable, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger, ToneChip } from "@aptransit/ui";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { BarSeriesChart } from "../../../components/charts";
import { istDate, useGovQuery } from "../../../lib/gov";
import { inputClass, OpsEmpty, OpsError } from "../../ops/ops-common";

const TABS = ["routes", "buses", "passengers", "delays", "demand"] as const;
type Tab = (typeof TABS)[number];
const MAX_DAYS = 14;

/** Tab, range and route live in the URL so a view can be shared and survives a reload. */
function useAnalyticsParams() {
  const params = useSearchParams(),
    router = useRouter(),
    path = usePathname();
  const tab = (TABS as readonly string[]).includes(params.get("tab") ?? "") ? (params.get("tab") as Tab) : "routes";
  const to = params.get("to") ?? istDate(-1);
  const from = params.get("from") ?? istDate(-7);
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) next.set(k, v);
    router.replace(`${path}?${next.toString()}`, { scroll: false });
  };
  return { tab, from, to, routeId: params.get("route") ?? "", set };
}

export function AnalyticsClient() {
  const t = useTranslations("govApp.analytics"),
    p = useAnalyticsParams();
  const days = Math.round((Date.parse(p.to) - Date.parse(p.from)) / 86_400_000) + 1;
  const rangeError = !(days >= 1) ? t("rangeOrder") : days > MAX_DAYS ? t("rangeMax", { days: MAX_DAYS }) : null;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <h1 className="text-h1">{t("title")}</h1>
      <fieldset className="flex flex-wrap items-end gap-4">
        <legend className="sr-only">{t("range")}</legend>
        <label className="flex flex-col gap-1 text-small">
          <span>{t("from")}</span>
          <input type="date" className={inputClass} value={p.from} max={istDate()} onChange={(e) => e.target.value && p.set({ from: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-small">
          <span>{t("to")}</span>
          <input type="date" className={inputClass} value={p.to} max={istDate()} onChange={(e) => e.target.value && p.set({ to: e.target.value })} />
        </label>
        {rangeError && (
          <p role="alert" className="text-small text-status-danger">
            {rangeError}
          </p>
        )}
      </fieldset>
      <Tabs value={p.tab} onValueChange={(v) => p.set({ tab: v })}>
        <TabsList aria-label={t("title")} className="max-w-full justify-start overflow-x-auto">
          {TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {t(`tabs.${tab}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        {!rangeError && (
          <>
            <TabsContent value="routes">{p.tab === "routes" && <RoutesTab from={p.from} to={p.to} />}</TabsContent>
            <TabsContent value="buses">{p.tab === "buses" && <BusesTab from={p.from} to={p.to} />}</TabsContent>
            <TabsContent value="passengers">{p.tab === "passengers" && <PassengersTab from={p.from} to={p.to} />}</TabsContent>
            <TabsContent value="delays">{p.tab === "delays" && <DelaysTab from={p.from} to={p.to} />}</TabsContent>
            <TabsContent value="demand">
              {p.tab === "demand" && <DemandTab from={p.from} to={p.to} routeId={p.routeId} onRoute={(id) => p.set({ route: id })} />}
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}

function useFormats() {
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  return { locale, num: (v: number) => nf.format(v), pct: (v: number) => `${nf.format(v)}%`, money: (p: number) => formatMoney(p, locale) };
}

function useChartLabels() {
  const t = useTranslations("govApp");
  return { showTable: t("showTable"), hideTable: t("hideTable") };
}

function RoutesTab({ from, to }: { from: string; to: string }) {
  const t = useTranslations("govApp.analytics"),
    f = useFormats(),
    labels = useChartLabels();
  const q = useGovQuery("/analytics/routes", z.array(RouteAnalyticsDto), { from, to });
  if (q.isError) return <OpsError error={q.error} retry={() => void q.refetch()} />;
  if (q.isPending) return <Skeleton className="h-64 w-full" />;
  const top = [...q.data].sort((a, b) => b.passengers - a.passengers).slice(0, 5);
  return (
    <div className="flex min-w-0 flex-col gap-6 pt-4">
      <BarSeriesChart
        title={t("topRoutes")}
        horizontal
        data={top.map((r) => ({ label: r.routeCode, value: r.passengers }))}
        xLabel={t("route")}
        yLabel={t("passengers")}
        format={f.num}
        labels={labels}
      />
      <DataTable
        label={t("tabs.routes")}
        rows={q.data}
        rowKey={(r) => r.routeId}
        empty={<OpsEmpty />}
        columns={[
          { id: "route", header: t("route"), cell: (r) => `${r.routeCode} ${f.locale === "te" ? r.routeNameTe : r.routeNameEn}`, sortValue: (r) => r.routeCode },
          { id: "passengers", header: t("passengers"), numeric: true, cell: (r) => f.num(r.passengers), sortValue: (r) => r.passengers },
          { id: "trips", header: t("trips"), numeric: true, cell: (r) => f.num(r.trips), sortValue: (r) => r.trips },
          { id: "load", header: t("loadFactor"), numeric: true, cell: (r) => f.pct(r.loadFactorPct), sortValue: (r) => r.loadFactorPct },
          { id: "delay", header: t("avgDelay"), numeric: true, cell: (r) => t("minutes", { minutes: f.num(r.avgDelayMin) }), sortValue: (r) => r.avgDelayMin },
          { id: "cancel", header: t("cancellations"), numeric: true, cell: (r) => f.num(r.cancellations), sortValue: (r) => r.cancellations },
          { id: "revenue", header: t("revenue"), numeric: true, cell: (r) => f.money(r.revenuePaise), sortValue: (r) => r.revenuePaise },
        ]}
      />
    </div>
  );
}

function BusesTab({ from, to }: { from: string; to: string }) {
  const t = useTranslations("govApp.analytics"),
    f = useFormats(),
    labels = useChartLabels();
  const q = useGovQuery("/analytics/buses", z.array(BusAnalyticsDto), { from, to });
  if (q.isError) return <OpsError error={q.error} retry={() => void q.refetch()} />;
  if (q.isPending) return <Skeleton className="h-64 w-full" />;
  const busiest = [...q.data].sort((a, b) => b.utilisationPct - a.utilisationPct).slice(0, 12);
  return (
    <div className="flex min-w-0 flex-col gap-6 pt-4">
      <BarSeriesChart
        title={t("utilisationTop")}
        horizontal
        data={busiest.map((b) => ({ label: b.registrationNumber, value: b.utilisationPct }))}
        xLabel={t("bus")}
        yLabel={t("utilisation")}
        format={f.pct}
        labels={labels}
      />
      <DataTable
        label={t("tabs.buses")}
        rows={q.data}
        rowKey={(r) => r.busId}
        empty={<OpsEmpty />}
        columns={[
          { id: "bus", header: t("bus"), cell: (r) => r.registrationNumber, sortValue: (r) => r.registrationNumber },
          { id: "type", header: t("busType"), cell: (r) => r.busType, sortValue: (r) => r.busType },
          { id: "trips", header: t("trips"), numeric: true, cell: (r) => f.num(r.trips), sortValue: (r) => r.trips },
          { id: "km", header: t("km"), numeric: true, cell: (r) => f.num(r.km), sortValue: (r) => r.km },
          { id: "util", header: t("utilisation"), numeric: true, cell: (r) => f.pct(r.utilisationPct), sortValue: (r) => r.utilisationPct },
          { id: "down", header: t("downtime"), numeric: true, cell: (r) => t("hours", { hours: f.num(r.downtimeHours) }), sortValue: (r) => r.downtimeHours },
        ]}
      />
    </div>
  );
}

function PassengersTab({ from, to }: { from: string; to: string }) {
  const t = useTranslations("govApp.analytics"),
    f = useFormats(),
    labels = useChartLabels();
  const q = useGovQuery("/analytics/passengers", PassengerAnalyticsDto, { from, to });
  if (q.isError) return <OpsError error={q.error} retry={() => void q.refetch()} />;
  if (q.isPending) return <Skeleton className="h-64 w-full" />;
  return (
    <div className="flex min-w-0 flex-col gap-6 pt-4">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-default bg-surface p-4">
          <dt className="text-small text-muted">{t("ticketsSold")}</dt>
          <dd className="text-h2 tabular-nums">{f.num(q.data.ticketsSold)}</dd>
        </div>
        <div className="rounded-lg border border-default bg-surface p-4">
          <dt className="text-small text-muted">{t("passUsage")}</dt>
          <dd className="text-h2 tabular-nums">{f.num(q.data.passUsage)}</dd>
        </div>
      </dl>
      <BarSeriesChart
        title={t("ticketsPerDay")}
        kind="line"
        data={q.data.daily.map((d) => ({ label: d.date.slice(5), value: d.ticketsSold }))}
        xLabel={t("date")}
        yLabel={t("ticketsSold")}
        format={f.num}
        labels={labels}
      />
      <BarSeriesChart
        title={t("busyHours")}
        data={q.data.busyHours.map((v, h) => ({ label: String(h).padStart(2, "0"), value: v }))}
        xLabel={t("hourAxis")}
        yLabel={t("ticketsSold")}
        format={f.num}
        labels={labels}
      />
    </div>
  );
}

function DelaysTab({ from, to }: { from: string; to: string }) {
  const t = useTranslations("govApp.analytics"),
    f = useFormats(),
    labels = useChartLabels();
  const q = useGovQuery("/analytics/delays", DelayAnalyticsDto, { from, to });
  if (q.isError) return <OpsError error={q.error} retry={() => void q.refetch()} />;
  if (q.isPending) return <Skeleton className="h-64 w-full" />;
  const clock = (h: number) => new Intl.DateTimeFormat(f.locale, { hour: "numeric", timeZone: "UTC" }).format(Date.UTC(2026, 0, 1, h % 24));
  return (
    <div className="flex min-w-0 flex-col gap-6 pt-4">
      <BarSeriesChart
        title={t("delayByHour")}
        tone="warning"
        data={q.data.avgDelayByHour.map((h) => ({ label: String(h.hour).padStart(2, "0"), value: h.avgDelayMin }))}
        xLabel={t("hourAxis")}
        yLabel={t("delayAxis")}
        format={f.num}
        labels={labels}
      />
      <section className="flex flex-col gap-2" aria-labelledby="worst-routes">
        <h2 id="worst-routes" className="text-h2">
          {t("worstRoutes")}
        </h2>
        {q.data.worstRoutes.length ? (
          <ol className="flex flex-col gap-2">
            {q.data.worstRoutes.map((r) => (
              <li key={r.routeId} className="rounded-md border border-default bg-surface p-3">
                {r.peakFromHour !== null && r.peakToHour !== null
                  ? t("worstSentence", { route: r.routeCode, minutes: f.num(r.avgDelayMin), from: clock(r.peakFromHour), to: clock(r.peakToHour) })
                  : t("worstSentenceNoPeak", { route: r.routeCode, minutes: f.num(r.avgDelayMin) })}
              </li>
            ))}
          </ol>
        ) : (
          <OpsEmpty />
        )}
      </section>
    </div>
  );
}

function DemandTab({ from, to, routeId, onRoute }: { from: string; to: string; routeId: string; onRoute: (id: string) => void }) {
  const t = useTranslations("govApp"),
    a = useTranslations("govApp.analytics"),
    f = useFormats();
  const routes = useGovQuery("/analytics/routes", z.array(RouteAnalyticsDto), { from, to });
  const chosen = routeId || routes.data?.[0]?.routeId || "";
  const q = useGovQuery("/analytics/demand", z.array(DemandBandDto), { routeId: chosen, from, to }, Boolean(chosen));
  return (
    <div className="flex min-w-0 flex-col gap-4 pt-4">
      <label className="flex max-w-md flex-col gap-1 text-small">
        <span>{a("route")}</span>
        <select className={inputClass} value={chosen} onChange={(e) => onRoute(e.target.value)}>
          {(routes.data ?? []).map((r) => (
            <option key={r.routeId} value={r.routeId}>
              {r.routeCode} {f.locale === "te" ? r.routeNameTe : r.routeNameEn}
            </option>
          ))}
        </select>
      </label>
      {q.isError ? (
        <OpsError error={q.error} retry={() => void q.refetch()} />
      ) : q.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <ul className="flex flex-wrap gap-2">
          {q.data.map((b) => (
            <li key={b.band}>
              <ToneChip
                tone={b.level === "HIGH" ? "danger" : b.level === "MEDIUM" ? "warning" : "neutral"}
                label={t("demandChip", { band: t(`bands.${b.band}`), level: t(`levels.${b.level}`), pct: f.num(b.loadFactorPct) })}
              />
            </li>
          ))}
        </ul>
      )}
      <p className="text-small text-muted">{a("demandNote")}</p>
    </div>
  );
}
