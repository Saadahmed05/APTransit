"use client";
import { useState } from "react";
import { z } from "zod";
import {
  IncidentDto,
  IncidentStatus,
  INCIDENT_STATUS_MAP,
  BusDto,
  OpsTripProfileDto,
  ResolveIncidentInput,
  can,
  formatTime,
} from "@aptransit/shared";
import {
  Button,
  DataTable,
  StatusBadge,
  IncidentStatusBadge,
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  Skeleton,
} from "@aptransit/ui";
import { useLocale, useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useMe } from "../../../components/auth-provider";
import { useOpsFilters, useOpsLive, useOpsQuery } from "../../../lib/ops";
import {
  FilterSelect,
  inputClass,
  OpsEmpty,
  OpsError,
  useOpsWrite,
  WriteError,
} from "../ops-common";
const OpsMap = dynamic(() => import("@aptransit/ui/map-view").then((m) => m.OpsMap), {
  ssr: false,
  loading: () => <Skeleton className="h-tracking-map w-full" />,
});
export default function IncidentsClient() {
  const t = useTranslations("opsApp"),
    all = useTranslations(),
    locale = useLocale(),
    { depotId, params, set } = useOpsFilters();
  useOpsLive(depotId);
  const incidents = useOpsQuery("/ops/incidents", z.array(IncidentDto), {
      depotId,
      status: params.get("status") ?? undefined,
    }),
    buses = useOpsQuery("/ops/buses", z.array(BusDto), { depotId });
  const [selected, setSelected] = useState<string | null>(null),
    current = incidents.data?.find((i) => i.id === selected);
  const columns = [
    {
      id: "code",
      header: t("code"),
      cell: (i: IncidentDto) => i.code,
      sortValue: (i: IncidentDto) => i.createdAt,
    },
    {
      id: "type",
      header: t("type"),
      cell: (i: IncidentDto) => (
        <StatusBadge
          status={i.type === "BREAKDOWN" ? "BREAKDOWN" : "INCIDENT"}
          label={all("driverApp.report.types." + i.type)}
        />
      ),
    },
    {
      id: "bus",
      header: t("bus"),
      cell: (i: IncidentDto) => buses.data?.find((b) => b.id === i.busId)?.regNo ?? i.busId,
    },
    { id: "trip", header: t("trip"), cell: (i: IncidentDto) => i.tripCode ?? i.tripId },
    {
      id: "time",
      header: t("reported"),
      cell: (i: IncidentDto) => formatTime(i.createdAt, locale),
      sortValue: (i: IncidentDto) => i.createdAt,
    },
    {
      id: "status",
      header: t("status"),
      cell: (i: IncidentDto) => (
        <IncidentStatusBadge status={i.status} label={all(INCIDENT_STATUS_MAP[i.status].i18nKey)} />
      ),
    },
  ];
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <h1 className="text-h1">{t("incidents")}</h1>
      {incidents.isError ? (
        <OpsError error={incidents.error} retry={() => void incidents.refetch()} />
      ) : (
        <DataTable
          label={t("incidents")}
          columns={columns}
          rows={incidents.data ?? []}
          rowKey={(i) => i.id}
          loading={incidents.isPending}
          empty={<OpsEmpty />}
          onRowClick={(i) => setSelected(i.id)}
          filters={
            <FilterSelect
              label={t("status")}
              value={params.get("status") ?? ""}
              onChange={(v) => set("status", v)}
            >
              <option value="">{t("allStatuses")}</option>
              {IncidentStatus.options.map((s) => (
                <option key={s} value={s}>
                  {t("incidentStatus." + s)}
                </option>
              ))}
            </FilterSelect>
          }
        />
      )}
      {current && <IncidentDrawer incident={current} close={() => setSelected(null)} />}
    </div>
  );
}
function IncidentDrawer({ incident: i, close }: { incident: IncidentDto; close: () => void }) {
  const t = useTranslations("opsApp"),
    all = useTranslations(),
    locale = useLocale(),
    me = useMe(),
    write = useOpsWrite(IncidentDto),
    trip = useOpsQuery("/ops/trips/" + i.tripId, OpsTripProfileDto),
    [invalid, setInvalid] = useState(false),
    canManage = can(me.data?.roles.map((r) => r.role) ?? [], "incident:manage");
  return (
    <Sheet
      open
      onOpenChange={(v) => {
        if (!v && !write.isPending) close();
      }}
    >
      <SheetContent closeLabel={all("common.close")} className="overflow-y-auto">
        <SheetTitle>{i.code}</SheetTitle>
        <SheetDescription>{all("driverApp.report.types." + i.type)}</SheetDescription>
        <div className="flex flex-col gap-4">
          <p>
            {t("reported")}: {formatTime(i.createdAt, locale)}
          </p>
          <p>
            {t("status")}: {all(INCIDENT_STATUS_MAP[i.status].i18nKey)}
          </p>
          {i.note && <p className="break-words">{i.note}</p>}
          {trip.isError ? (
            <OpsError error={trip.error} retry={() => void trip.refetch()} />
          ) : trip.isPending ? (
            <Skeleton className="h-12 w-full" />
          ) : (
            <>
              <p>
                {t("bus")}: {trip.data.assignment?.busRegNo ?? t("unassigned")}
              </p>
              <p>
                {t("trip")}: {trip.data.code}
              </p>
              <p>
                {t("route")}: {locale === "te" ? trip.data.routeNameTe : trip.data.routeNameEn}
              </p>
            </>
          )}
          <OpsMap
            buses={[
              {
                tripId: i.tripId,
                tripCode: trip.data?.code ?? i.tripId,
                busId: i.busId,
                busRegNo: trip.data?.assignment?.busRegNo ?? i.busId,
                routeId: trip.data?.routeId ?? i.tripId,
                routeCode: trip.data?.routeNameEn ?? i.code,
                depotId: trip.data?.depotId ?? i.busId,
                lat: i.lat,
                lng: i.lng,
                speedKmh: null,
                headingDeg: null,
                recordedAt: i.createdAt,
                delayMinutes: trip.data?.delayMinutes ?? 0,
                displayStatus: i.type === "BREAKDOWN" ? "BREAKDOWN" : "INCIDENT",
                progressPct: 0,
                nextStopId: null,
              },
            ]}
            mapStyle={
              process.env.NEXT_PUBLIC_MAP_STYLE ?? "https://tiles.openfreemap.org/styles/liberty"
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
            details={trip.data ? [{ tripId: trip.data.id, route: locale === "te" ? trip.data.routeNameTe : trip.data.routeNameEn, driver: trip.data.assignment?.driverName ?? t("unassigned") }] : []}
          />
          <WriteError error={write.error} />
          {canManage && i.status === "OPEN" && (
            <Button
              variant="secondary"
              disabled={write.isPending}
              onClick={() =>
                write.mutate({ path: "/ops/incidents/" + i.id + "/acknowledge", body: {} })
              }
            >
              {t("acknowledge")}
            </Button>
          )}
          {canManage && i.status !== "RESOLVED" && (
            <form
              className="flex flex-col gap-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (write.isPending) return;
                const note = new FormData(e.currentTarget).get("note"),
                  body = ResolveIncidentInput.safeParse({ note });
                setInvalid(!body.success);
                if (!body.success) return;
                try {
                  await write.mutateAsync({
                    path: "/ops/incidents/" + i.id + "/resolve",
                    body: body.data,
                  });
                  close();
                } catch {
                  /* Keep the note for retry. */
                }
              }}
            >
              <label className="flex flex-col gap-1">
                <span>{t("resolutionNote")}</span>
                <textarea
                  className={inputClass + " min-h-24 py-3"}
                  name="note"
                  required
                  maxLength={1000}
                />
              </label>
              <p className="text-small text-muted">{t("resolveHint")}</p>
              {invalid && <p role="alert">{t("invalidForm")}</p>}
              <Button type="submit" disabled={write.isPending}>
                {t("resolve")}
              </Button>
            </form>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
