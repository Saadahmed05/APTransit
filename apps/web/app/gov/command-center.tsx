"use client";
import { formatTime, GovMapDto, GovOverviewDto } from "@aptransit/shared";
import { Skeleton, StatusBadge } from "@aptransit/ui";
import { useLocale, useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { boundsOf, delayTone, useGovLive, useGovQuery, useGovScope, useStates } from "../../lib/gov";
import { OpsEmpty, OpsError } from "../ops/ops-common";
import { GovBreadcrumb, GovKpiRow, LiveIndicator, placeName } from "./gov-common";

const GovMap = dynamic(() => import("@aptransit/ui/map-view").then((m) => m.GovMap), {
  ssr: false,
  loading: () => <Skeleton className="h-tracking-map w-full" />,
});

const MAP_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty";

/**
 * Command center (plan sec 35). /gov shows everything in the caller's scope (every state for
 * SUPER_ADMIN, with the state picker); /gov/state/[id] shows one state (D-034). District officers
 * go straight to their district.
 */
export function CommandCenter({ stateId }: { stateId?: string } = {}) {
  const t = useTranslations("govApp"),
    all = useTranslations(),
    locale = useLocale(),
    router = useRouter(),
    scope = useGovScope(),
    { states } = useStates();
  const officer = scope.ready && !scope.statewide && scope.districtId;
  useEffect(() => {
    if (officer) router.replace(`/gov/district/${scope.districtId}`);
  }, [officer, router, scope.districtId]);

  useGovLive(stateId);
  const query = stateId ? { stateId } : {};
  const overview = useGovQuery("/gov/overview", GovOverviewDto, query, scope.statewide);
  const map = useGovQuery("/gov/map", GovMapDto, query, scope.statewide);
  // The map shows the picked state, the caller's states, or every state for the platform view
  const shown = states.filter((s) => (stateId ? s.id === stateId : scope.platform || scope.stateIds.includes(s.id)));
  const state = stateId ? shown[0] : undefined;

  if (!scope.ready || officer) return <Skeleton className="h-tracking-map w-full" />;

  const o = overview.data;
  const delayedRoutes = Object.values(
    (map.data?.buses ?? [])
      .filter((b) => b.delayMinutes >= 5)
      .reduce<Record<string, { code: string; total: number; count: number }>>((acc, b) => {
        const row = (acc[b.routeId] ??= { code: b.routeCode, total: 0, count: 0 });
        row.total += b.delayMinutes;
        row.count += 1;
        return acc;
      }, {}),
  )
    .map((r) => ({ code: r.code, avg: Math.round(r.total / r.count), count: r.count }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 5);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {stateId && scope.platform && (
        <GovBreadcrumb items={[{ href: "/gov", label: t("allStates") }, { label: placeName(locale, state) || t("state") }]} />
      )}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-h1">{t("title")}</h1>
          {state && <p className="text-body text-muted">{placeName(locale, state)}</p>}
        </div>
        <LiveIndicator updatedAt={overview.dataUpdatedAt} />
      </div>

      {!stateId && scope.platform && states.length > 0 && (
        <nav aria-label={t("statePicker")}>
          <ul className="flex flex-wrap gap-2">
            {states.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/gov/state/${s.id}`}
                  aria-label={t("openState", { name: placeName(locale, s) })}
                  className="inline-flex min-h-11 items-center rounded-md border border-default bg-surface px-4 hover:bg-surface-raised"
                >
                  {placeName(locale, s)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {overview.isError ? (
        <OpsError error={overview.error} retry={() => void overview.refetch()} />
      ) : (
        <GovKpiRow
          loading={overview.isPending}
          items={[
            { id: "activeBuses", value: o?.activeBuses ?? null },
            { id: "activeTrips", value: o?.activeTrips ?? null },
            { id: "passengersToday", value: o?.passengersToday ?? null },
            { id: "delayedTrips", value: o?.delayedTrips ?? null },
            { id: "incidents", value: o?.openIncidents ?? null },
          ]}
        />
      )}

      <p className="rounded-lg border border-default bg-surface p-4 md:hidden">{t("smallScreen")}</p>

      <div className="hidden min-w-0 gap-6 md:grid xl:grid-cols-3">
        <section className="flex min-w-0 flex-col gap-3 xl:col-span-2" aria-labelledby="gov-map-title">
          <h2 id="gov-map-title" className="text-h2">
            {t("mapTitle")}
          </h2>
          {map.isError ? (
            <OpsError error={map.error} retry={() => void map.refetch()} />
          ) : map.isPending ? (
            <Skeleton className="h-tracking-map w-full" />
          ) : (
            <GovMap
              mapStyle={MAP_STYLE}
              bounds={boundsOf(shown)}
              buses={map.data.buses}
              districts={map.data.districts
                .filter((d) => d.lat !== null && d.lng !== null)
                .map((d) => {
                  const name = locale === "te" ? (d.nameTe ?? d.code ?? "") : (d.nameEn ?? d.code ?? "");
                  return {
                    id: d.id,
                    name,
                    lat: d.lat!,
                    lng: d.lng!,
                    activeBuses: d.activeBuses,
                    delayed: d.delayed,
                    incidents: d.incidents,
                    tone: delayTone(d.activeBuses, d.delayed),
                    label: t("districtMarker", { name, buses: d.activeBuses, delayed: d.delayed, incidents: d.incidents }),
                  };
                })}
              incidents={map.data.incidents.map((i) => ({
                id: i.id,
                lat: i.lat,
                lng: i.lng,
                label: `${all("driverApp.report.types." + i.type)} ${i.busRegNo ?? ""}`,
              }))}
              onDistrict={(id) => router.push(`/gov/district/${id}`)}
              labels={{ error: t("mapError"), retry: all("common.retry"), legend: t("mapLegend") }}
            />
          )}
          {map.data && (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label={t("districts")}>
              {map.data.districts.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/gov/district/${d.id}`}
                    className="flex min-h-11 flex-col gap-1 rounded-md border border-default bg-surface px-3 py-2 hover:bg-surface-raised"
                  >
                    <span className="min-w-0 font-medium">{placeName(locale, { nameEn: d.nameEn ?? "", nameTe: d.nameTe ?? "" })}</span>
                    <span className="text-small tabular-nums text-muted">
                      {t("districtShort", { buses: d.activeBuses, delayed: d.delayed })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="gov-feed-title" className="flex flex-col gap-3">
            <h2 id="gov-feed-title" className="text-h2">
              {t("incidentFeed")}
            </h2>
            {map.isPending ? (
              <Skeleton className="h-32 w-full" />
            ) : map.data?.incidents.length ? (
              <ul className="flex flex-col gap-2" aria-live="polite">
                {map.data.incidents.slice(0, 10).map((i) => (
                  <li key={i.id} className="rounded-md border border-default bg-surface p-3">
                    <StatusBadge
                      status={i.type === "BREAKDOWN" ? "BREAKDOWN" : "INCIDENT"}
                      label={all("driverApp.report.types." + i.type)}
                    />
                    <p className="mt-1 break-words text-small">
                      <Link className="text-primary underline-offset-4 hover:underline" href={`/gov/trip/${i.tripId}`}>
                        {i.tripCode ?? i.code}
                      </Link>{" "}
                      {i.busRegNo ?? ""}
                    </p>
                    <p className="text-small text-muted">{formatTime(i.createdAt, locale)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <OpsEmpty />
            )}
          </section>
          <section aria-labelledby="gov-delays-title" className="flex flex-col gap-3">
            <h2 id="gov-delays-title" className="text-h2">
              {t("mostDelayed")}
            </h2>
            {delayedRoutes.length ? (
              <ol className="flex flex-col gap-2">
                {delayedRoutes.map((r) => (
                  <li key={r.code} className="flex min-h-11 items-center justify-between gap-2 rounded-md border border-default bg-surface px-3">
                    <span>{r.code}</span>
                    <span className="tabular-nums text-small">{t("minutesLate", { minutes: r.avg })}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-small text-muted">{t("noDelays")}</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
