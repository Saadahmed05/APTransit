"use client";
import { z } from "zod";
import {
  OpsDashboardDto,
  LiveBusDto,
  IncidentDto,
  OpsTripDto,
  busDisplayStatus,
  formatTime,
} from "@aptransit/shared";
import { Button, KpiTile, StatusBadge, Skeleton } from "@aptransit/ui";
import { useLocale, useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useMe } from "../../components/auth-provider";
import { can } from "@aptransit/shared";
import { useOpsBounds, useOpsFilters, useOpsLive, useOpsQuery } from "../../lib/ops";
import { OpsEmpty, OpsError, useOpsWrite, WriteError } from "./ops-common";
const OpsMap = dynamic(() => import("@aptransit/ui/map-view").then((m) => m.OpsMap), {
  ssr: false,
  loading: () => <Skeleton className="h-tracking-map w-full" />,
});
export default function OpsDashboard() {
  const t = useTranslations("opsApp"),
    all = useTranslations(),
    locale = useLocale(),
    me = useMe(),
    { depotId } = useOpsFilters();
  useOpsLive(depotId);
  const bounds = useOpsBounds();
  const trips = useOpsQuery("/ops/trips", z.array(OpsTripDto), { depotId });
  const kpi = useOpsQuery("/ops/dashboard", OpsDashboardDto, { depotId }),
    buses = useOpsQuery("/tracking/live", z.array(LiveBusDto), { depotId }),
    incidents = useOpsQuery("/ops/incidents", z.array(IncidentDto), { depotId });
  const write = useOpsWrite(IncidentDto),
    canManage = can(me.data?.roles.map((r) => r.role) ?? [], "incident:manage");
  const active = incidents.data?.filter((i) => i.status !== "RESOLVED") ?? [];
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <h1 className="text-h1">{t("dashboard")}</h1>
      {kpi.isError ? (
        <OpsError error={kpi.error} retry={() => void kpi.refetch()} />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {(
            ["activeBuses", "totalBuses", "activeTrips", "delayedTrips", "breakdowns"] as const
          ).map((key) => (
            <KpiTile
              key={key}
              label={t(key)}
              value={new Intl.NumberFormat(locale).format(kpi.data?.[key] ?? 0)}
              loading={kpi.isPending}
            />
          ))}
        </div>
      )}
      <section aria-label={t("busStatus")} className="flex flex-wrap gap-4">
        {(["RUNNING", "BREAKDOWN", "MAINTENANCE", "IDLE"] as const).map((status) => (
          <div key={status} className="flex items-center gap-2">
            <StatusBadge
              status={busDisplayStatus(status)}
              label={all("status." + busDisplayStatus(status))}
            />
            <span className="tabular-nums">{kpi.data?.busStatusCounts[status] ?? 0}</span>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <StatusBadge status="DELAYED" label={all("status.DELAYED")} />
          <span>{kpi.data?.delayedTrips ?? 0}</span>
        </div>
      </section>
      <div className="grid min-w-0 gap-6 xl:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="text-h2">{t("liveMap")}</h2>
          {buses.isError ? (
            <OpsError error={buses.error} retry={() => void buses.refetch()} />
          ) : buses.isPending ? (
            <Skeleton className="h-tracking-map w-full" />
          ) : buses.data.length ? (
            <OpsMap
              bounds={bounds}
              buses={buses.data}
              mapStyle={
                process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty"
              }
              labels={{
                error: t("mapError"),
                retry: all("common.retry"),
                route: t("route"),
                driver: t("driver"),
                delay: t("delay"),
                close: all("common.close"),
              }}
              statusLabel={(s) => all("status." + s)}
              details={(trips.data ?? []).map((trip) => ({ tripId: trip.id, route: locale === "te" ? trip.routeNameTe : trip.routeNameEn, driver: trip.assignment?.driverName ?? t("unassigned") }))}
            />
          ) : (
            <OpsEmpty />
          )}
        </section>
        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="text-h2">{t("openIncidents")}</h2>
          <WriteError error={write.error} />
          {incidents.isError ? (
            <OpsError error={incidents.error} retry={() => void incidents.refetch()} />
          ) : incidents.isPending ? (
            <Skeleton className="h-48 w-full" />
          ) : active.length ? (
            <ul className="flex flex-col gap-3">
              {active.slice(0, 10).map((i) => (
                <li
                  key={i.id}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-default bg-surface p-4"
                >
                  <div className="min-w-0">
                    <StatusBadge
                      status={i.type === "BREAKDOWN" ? "BREAKDOWN" : "INCIDENT"}
                      label={all("driverApp.report.types." + i.type)}
                    />
                    <p className="break-words text-small">{i.code} {i.busRegNo ?? trips.data?.find((trip) => trip.id === i.tripId)?.assignment?.busRegNo ?? ""} {i.tripCode ?? trips.data?.find((trip) => trip.id === i.tripId)?.code ?? ""}</p>
                    <p className="text-small text-muted">{formatTime(i.createdAt, locale)}</p>
                  </div>
                  {i.status === "OPEN" && canManage ? (
                    <Button
                      disabled={write.isPending}
                      onClick={() =>
                        write.mutate({ path: "/ops/incidents/" + i.id + "/acknowledge", body: {} })
                      }
                    >
                      {t("acknowledge")}
                    </Button>
                  ) : (
                    <span>{t("incidentStatus." + i.status)}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <OpsEmpty />
          )}
        </section>
      </div>
    </div>
  );
}
