"use client";
import {
  DelayAnalyticsDto,
  DemandBandDto,
  formatTime,
  GovDepotSummaryDto,
  GovDistrictSummaryDto,
  GovMapDto,
  GovRouteSummaryDto,
  OpsTripProfileDto,
} from "@aptransit/shared";
import { DataTable, Skeleton, StatusBadge, ToneChip } from "@aptransit/ui";
import { useLocale, useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import Link from "next/link";
import { z } from "zod";
import { delayTone, istDate, useGovLive, useGovPlaces, useGovQuery, useGovScope, useStates } from "../../lib/gov";
import { TrackTrip } from "../(citizen)/track/[tripId]/track-trip";
import { BarSeriesChart } from "../../components/charts";
import { OpsEmpty, OpsError } from "../ops/ops-common";
import { type Crumb, GovBreadcrumb, GovKpiRow, LiveIndicator, placeName } from "./gov-common";

const GovMap = dynamic(() => import("@aptransit/ui/map-view").then((m) => m.GovMap), {
  ssr: false,
  loading: () => <Skeleton className="h-tracking-map w-full" />,
});
const MAP_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty";

/**
 * Breadcrumb from the state down to the given level (D-034: the state name comes from the API).
 * SUPER_ADMIN starts at all states; officers start at their district.
 */
function useCrumbs(level: { districtId?: string; depotId?: string; route?: { id: string; code: string }; trip?: string }): Crumb[] {
  const t = useTranslations("govApp"),
    locale = useLocale(),
    scope = useGovScope(),
    places = useGovPlaces(),
    { states } = useStates();
  const depot = places.depots.find((d) => d.id === level.depotId);
  const districtId = level.districtId ?? depot?.districtId;
  const district = places.districts.find((d) => d.id === districtId);
  const state = states.find((s) => s.id === district?.stateId);
  const crumbs: Crumb[] = scope.platform ? [{ href: "/gov", label: t("allStates") }] : [];
  if (scope.statewide)
    crumbs.push({ href: scope.platform && state ? `/gov/state/${state.id}` : "/gov", label: placeName(locale, state) || t("state") });
  if (districtId) crumbs.push({ href: `/gov/district/${districtId}`, label: placeName(locale, district) || t("district") });
  if (level.depotId) crumbs.push({ href: `/gov/depot/${level.depotId}`, label: placeName(locale, depot) || t("depot") });
  if (level.route) crumbs.push({ href: `/gov/route/${level.route.id}`, label: level.route.code });
  if (level.trip) crumbs.push({ label: level.trip });
  return crumbs;
}

const tripTone = (delayed: number, total: number) => delayTone(total, delayed);

export function DistrictView({ id }: { id: string }) {
  const t = useTranslations("govApp"),
    all = useTranslations(),
    locale = useLocale();
  useGovLive();
  const summary = useGovQuery(`/gov/districts/${id}`, GovDistrictSummaryDto);
  const map = useGovQuery("/gov/map", GovMapDto);
  const crumbs = useCrumbs({ districtId: id });
  const s = summary.data;
  const marker = map.data?.districts.find((d) => d.id === id);
  const depotIds = new Set(s?.depots.map((d) => d.id) ?? []);
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <GovBreadcrumb items={crumbs} />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-h1">{s ? placeName(locale, s) : t("district")}</h1>
        <LiveIndicator updatedAt={summary.dataUpdatedAt} />
      </div>
      {summary.isError ? (
        <OpsError error={summary.error} retry={() => void summary.refetch()} />
      ) : (
        <>
          <GovKpiRow
            loading={summary.isPending}
            items={[
              { id: "activeBuses", value: s?.activeBuses ?? null },
              { id: "activeTrips", value: s?.activeTrips ?? null },
              { id: "passengersToday", value: s?.passengersToday ?? null },
              { id: "delayedTrips", value: s?.delayedTrips ?? null },
              { id: "incidents", value: s?.openIncidents ?? null },
            ]}
          />
          <div className="hidden md:block">
            {map.data && marker && marker.lat !== null && marker.lng !== null ? (
              <GovMap
                mapStyle={MAP_STYLE}
                focus={{ lat: marker.lat, lng: marker.lng, zoom: 8 }}
                districts={[]}
                buses={map.data.buses.filter((b) => depotIds.has(b.depotId))}
                incidents={[]}
                labels={{ error: t("mapError"), retry: all("common.retry"), legend: t("mapLegend") }}
              />
            ) : (
              <Skeleton className="h-tracking-map w-full" />
            )}
          </div>
          <section className="flex flex-col gap-3" aria-labelledby="depots-title">
            <h2 id="depots-title" className="text-h2">
              {t("depots")}
            </h2>
            {summary.isPending ? (
              <Skeleton className="h-40 w-full" />
            ) : s?.depots.length ? (
              <ul className="grid gap-3 md:grid-cols-2">
                {s.depots.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/gov/depot/${d.id}`}
                      className="flex min-h-11 flex-col gap-2 rounded-lg border border-default bg-surface p-4 hover:bg-surface-raised"
                    >
                      <span className="text-h3">{placeName(locale, d)}</span>
                      <span className="flex flex-wrap gap-x-4 gap-y-1 text-small tabular-nums text-muted">
                        <span>{t("activeOfTotal", { active: d.activeBuses, total: d.totalBuses })}</span>
                        <span>{t("tripsRunning", { count: d.activeTrips })}</span>
                        <span>{t("tripsDelayed", { count: d.delayedTrips })}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <OpsEmpty />
            )}
          </section>
        </>
      )}
    </div>
  );
}

export function DepotView({ id }: { id: string }) {
  const t = useTranslations("govApp"),
    locale = useLocale();
  useGovLive();
  const summary = useGovQuery(`/gov/depots/${id}`, GovDepotSummaryDto);
  const crumbs = useCrumbs({ depotId: id });
  const s = summary.data;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <GovBreadcrumb items={crumbs} />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-h1">{s ? placeName(locale, s) : t("depot")}</h1>
        <LiveIndicator updatedAt={summary.dataUpdatedAt} />
      </div>
      {summary.isError ? (
        <OpsError error={summary.error} retry={() => void summary.refetch()} />
      ) : (
        <>
          <GovKpiRow
            loading={summary.isPending}
            items={[
              { id: "activeBuses", value: s?.activeBuses ?? null },
              { id: "totalBuses", value: s?.totalBuses ?? null },
              { id: "activeTrips", value: s?.activeTrips ?? null },
              { id: "delayedTrips", value: s?.delayedTrips ?? null },
            ]}
          />
          <section className="flex min-w-0 flex-col gap-3" aria-labelledby="routes-title">
            <h2 id="routes-title" className="text-h2">
              {t("routes")}
            </h2>
            {summary.isPending ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <DataTable
                label={t("routes")}
                rows={s?.routes ?? []}
                rowKey={(r) => r.id}
                empty={<OpsEmpty />}
                columns={[
                  { id: "route",
                    header: t("route"),
                    cell: (r) => (
                      <Link className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline" href={`/gov/route/${r.id}`}>
                        {r.code} {placeName(locale, r)}
                      </Link>
                    ),
                  },
                  { id: "trips", header: t("tripsToday"), numeric: true, cell: (r) => r.tripsToday },
                  { id: "delayed",
                    header: t("delayedTrips"),
                    numeric: true,
                    cell: (r) => (
                      <ToneChip tone={tripTone(r.delayedTrips, r.tripsToday)} label={String(r.delayedTrips)} />
                    ),
                  },
                  { id: "load", header: t("loadFactor"), numeric: true, cell: (r) => `${r.loadFactorPct}%` },
                ]}
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}

export function RouteView({ id }: { id: string }) {
  const t = useTranslations("govApp"),
    all = useTranslations(),
    locale = useLocale();
  useGovLive();
  const summary = useGovQuery(`/gov/routes/${id}`, GovRouteSummaryDto);
  const range = { routeId: id, from: istDate(-7), to: istDate(-1) };
  const delays = useGovQuery("/analytics/delays", DelayAnalyticsDto, range);
  const demand = useGovQuery("/analytics/demand", z.array(DemandBandDto), range);
  const s = summary.data;
  const crumbs = useCrumbs({ depotId: s?.depotId, route: s ? { id: s.id, code: s.code } : undefined });
  const running = s?.trips.filter((tr) => tr.status === "RUNNING") ?? [];
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <GovBreadcrumb items={crumbs} />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-h1">{s ? `${s.code} ${placeName(locale, s)}` : t("route")}</h1>
        <LiveIndicator updatedAt={summary.dataUpdatedAt} />
      </div>
      {summary.isError ? (
        <OpsError error={summary.error} retry={() => void summary.refetch()} />
      ) : (
        <>
          <GovKpiRow
            loading={summary.isPending}
            items={[
              { id: "tripsToday", value: s?.tripsToday ?? null },
              { id: "delayedTrips", value: s?.delayedTrips ?? null },
              { id: "loadFactor", value: s?.loadFactorPct ?? null, format: "percent" },
              { id: "busesOnRoute", value: s?.busesOnRoute ?? null },
            ]}
          />
          <div className="grid min-w-0 gap-6 lg:grid-cols-2">
            <section className="flex min-w-0 flex-col gap-3" aria-labelledby="delay-hour-title">
              <h2 id="delay-hour-title" className="text-h2">
                {t("delayByHour")}
              </h2>
              <p className="text-small text-muted">{t("lastSevenDays")}</p>
              {delays.isError ? (
                <OpsError error={delays.error} retry={() => void delays.refetch()} />
              ) : delays.isPending ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <BarSeriesChart
                  title={t("delayByHour")}
                  tone="warning"
                  data={delays.data.avgDelayByHour.map((h) => ({ label: String(h.hour).padStart(2, "0"), value: h.avgDelayMin }))}
                  xLabel={t("hourAxis")}
                  yLabel={t("delayAxis")}
                  format={(v) => nf.format(v)}
                  labels={{ showTable: t("showTable"), hideTable: t("hideTable") }}
                />
              )}
            </section>
            <section className="flex min-w-0 flex-col gap-3" aria-labelledby="demand-title">
              <h2 id="demand-title" className="text-h2">
                {t("demand")}
              </h2>
              <p className="text-small text-muted">{t("lastSevenDays")}</p>
              {demand.isError ? (
                <OpsError error={demand.error} retry={() => void demand.refetch()} />
              ) : demand.isPending ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {demand.data.map((b) => (
                    <li key={b.band}>
                      <ToneChip tone={b.level === "HIGH" ? "danger" : b.level === "MEDIUM" ? "warning" : "neutral"} label={t("demandChip", {
                          band: t(`bands.${b.band}`),
                          level: t(`levels.${b.level}`),
                          pct: nf.format(b.loadFactorPct),
                        })} />
                    </li>
                  ))}
                </ul>
              )}
              <h2 className="mt-4 text-h2">{t("busesNow")}</h2>
              {running.length ? (
                <ul className="flex flex-col gap-2">
                  {running.map((tr) => (
                    <li key={tr.id}>
                      <Link href={`/gov/trip/${tr.id}`} className="flex min-h-11 items-center justify-between gap-2 rounded-md border border-default bg-surface px-3 hover:bg-surface-raised">
                        <span>{tr.assignment?.busRegNo ?? tr.code}</span>
                        <StatusBadge status={tr.displayStatus} label={all("status." + tr.displayStatus)} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-small text-muted">{t("noBusesNow")}</p>
              )}
            </section>
          </div>
          <section className="flex min-w-0 flex-col gap-3" aria-labelledby="trips-title">
            <h2 id="trips-title" className="text-h2">
              {t("tripsToday")}
            </h2>
            {summary.isPending ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <DataTable
                label={t("tripsToday")}
                rows={s?.trips ?? []}
                rowKey={(r) => r.id}
                empty={<OpsEmpty />}
                columns={[
                  { id: "departure",
                    header: t("departure"),
                    cell: (r) => (
                      <Link className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline" href={`/gov/trip/${r.id}`}>
                        {formatTime(r.scheduledDepartureAt, locale)}
                      </Link>
                    ),
                  },
                  { id: "status", header: t("status"), cell: (r) => <StatusBadge status={r.displayStatus} label={all("status." + r.displayStatus)} /> },
                  { id: "delay", header: t("delay"), numeric: true, cell: (r) => t("minutesShort", { minutes: r.delayMinutes }) },
                  { id: "bus", header: t("bus"), cell: (r) => r.assignment?.busRegNo ?? t("unassigned") },
                  { id: "passengers", header: t("passengers"), numeric: true, cell: (r) => r.passengers },
                ]}
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}

export function TripView({ id }: { id: string }) {
  const t = useTranslations("govApp"),
    all = useTranslations(),
    locale = useLocale();
  useGovLive();
  const trip = useGovQuery(`/ops/trips/${id}`, OpsTripProfileDto);
  const d = trip.data;
  const crumbs = useCrumbs({
    depotId: d?.depotId,
    route: d ? { id: d.routeId, code: placeName(locale, { nameEn: d.routeNameEn, nameTe: d.routeNameTe }) } : undefined,
    trip: d?.code ?? t("trip"),
  });
  const current = d?.assignment ?? d?.assignments[0] ?? null;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <GovBreadcrumb items={crumbs} />
      <section aria-labelledby="trip-facts" className="flex flex-col gap-3">
        <h2 id="trip-facts" className="text-h2">
          {t("tripFacts")}
        </h2>
        {trip.isError ? (
          <OpsError error={trip.error} retry={() => void trip.refetch()} />
        ) : trip.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <dl className="grid gap-3 rounded-lg border border-default bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [t("bus"), current?.busRegNo ?? t("unassigned")],
              [t("driver"), current?.driverName ?? t("unassigned")],
              [t("conductor"), current?.conductorName ?? t("unassigned")],
              [t("passengers"), String(d!.passengers)],
              [t("departure"), formatTime(d!.scheduledDepartureAt, locale)],
              [t("delay"), t("minutesShort", { minutes: d!.delayMinutes })],
              [t("incidents"), String(d!.incidents.length)],
            ].map(([label, value]) => (
              <div key={label} className="flex min-w-0 flex-col">
                <dt className="text-small text-muted">{label}</dt>
                <dd className="break-words">{value}</dd>
              </div>
            ))}
            <div className="flex min-w-0 flex-col">
              <dt className="text-small text-muted">{t("status")}</dt>
              <dd>
                <StatusBadge status={d!.displayStatus} label={all("status." + d!.displayStatus)} />
              </dd>
            </div>
          </dl>
        )}
      </section>
      <TrackTrip tripId={id} />
    </div>
  );
}
