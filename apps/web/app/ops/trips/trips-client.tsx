"use client";
import { useState } from "react";
import { z } from "zod";
import {
  OpsTripDto,
  OpsDepotDto,
  TripDto,
  TripStatus,
  BusDto,
  StaffDto,
  AssignTripInput,
  formatIstDate,
  formatTime,
  can,
} from "@aptransit/shared";
import {
  Button,
  DataTable,
  StatusBadge,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@aptransit/ui";
import { useLocale, useTranslations } from "next-intl";
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
export default function TripsClient() {
  const t = useTranslations("opsApp"),
    all = useTranslations(),
    locale = useLocale(),
    me = useMe(),
    { depotId, params, set } = useOpsFilters();
  useOpsLive(depotId);
  const date = params.get("date") ?? formatIstDate(new Date()),
    trips = useOpsQuery("/ops/trips", z.array(OpsTripDto), {
      depotId,
      date,
      status: params.get("status") ?? undefined,
      routeId: params.get("route") ?? undefined,
    }),
    routes = useOpsQuery(
      "/ops/routes",
      z.array(OpsDepotDto.pick({ id: true, nameEn: true, nameTe: true })),
      { depotId },
    );
  const [selected, setSelected] = useState<OpsTripDto | null>(null);
  const columns = [
    {
      id: "code",
      header: t("code"),
      cell: (r: OpsTripDto) => r.code,
      sortValue: (r: OpsTripDto) => r.code,
    },
    {
      id: "route",
      header: t("route"),
      cell: (r: OpsTripDto) => (locale === "te" ? r.routeNameTe : r.routeNameEn),
    },
    {
      id: "departure",
      header: t("departure"),
      cell: (r: OpsTripDto) => formatTime(r.scheduledDepartureAt, locale),
      sortValue: (r: OpsTripDto) => r.scheduledDepartureAt,
    },
    {
      id: "bus",
      header: t("bus"),
      cell: (r: OpsTripDto) => r.assignment?.busRegNo ?? t("unassigned"),
    },
    {
      id: "driver",
      header: t("driver"),
      cell: (r: OpsTripDto) => r.assignment?.driverName ?? t("unassigned"),
    },
    {
      id: "status",
      header: t("status"),
      cell: (r: OpsTripDto) => (
        <StatusBadge status={r.displayStatus} label={all("status." + r.displayStatus)} />
      ),
    },
    {
      id: "delay",
      header: t("delay"),
      numeric: true,
      cell: (r: OpsTripDto) => r.delayMinutes,
      sortValue: (r: OpsTripDto) => r.delayMinutes,
    },
    {
      id: "passengers",
      header: t("passengers"),
      numeric: true,
      cell: (r: OpsTripDto) => r.passengers,
      sortValue: (r: OpsTripDto) => r.passengers,
    },
  ];
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <h1 className="text-h1">{t("trips")}</h1>
      {trips.isError ? (
        <OpsError error={trips.error} retry={() => void trips.refetch()} />
      ) : (
        <DataTable
          label={t("trips")}
          columns={columns}
          rows={trips.data ?? []}
          rowKey={(r) => r.id}
          loading={trips.isPending}
          empty={<OpsEmpty />}
          rowActions={
            can(me.data?.roles.map((r) => r.role) ?? [], "trip:assign")
              ? (r) =>
                  r.status === "SCHEDULED" ? (
                    <Button variant="secondary" onClick={() => setSelected(r)}>
                      {t("assign")}
                    </Button>
                  ) : null
              : undefined
          }
          filters={
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-small">
                <span>{t("date")}</span>
                <input
                  type="date"
                  className={inputClass}
                  value={date}
                  onChange={(e) => set("date", e.target.value)}
                />
              </label>
              <FilterSelect
                label={t("status")}
                value={params.get("status") ?? ""}
                onChange={(v) => set("status", v)}
              >
                <option value="">{t("allStatuses")}</option>
                {TripStatus.options.map((s) => (
                  <option key={s} value={s}>
                    {all("status." + (s === "SCHEDULED" ? "UPCOMING" : s))}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect
                label={t("route")}
                value={params.get("route") ?? ""}
                onChange={(v) => set("route", v)}
              >
                <option value="">{t("allRoutes")}</option>
                {routes.data?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {locale === "te" ? r.nameTe : r.nameEn}
                  </option>
                ))}
              </FilterSelect>
            </div>
          }
        />
      )}
      {selected && <AssignDialog trip={selected} close={() => setSelected(null)} />}
    </div>
  );
}
function AssignDialog({ trip, close }: { trip: OpsTripDto; close: () => void }) {
  const t = useTranslations("opsApp"),
    all = useTranslations(),
    buses = useOpsQuery("/ops/buses/available", z.array(BusDto), {
      depotId: trip.depotId,
      at: trip.scheduledDepartureAt,
    }),
    drivers = useOpsQuery("/ops/staff", z.array(StaffDto), {
      depotId: trip.depotId,
      type: "DRIVER",
    }),
    conductors = useOpsQuery("/ops/staff", z.array(StaffDto), {
      depotId: trip.depotId,
      type: "CONDUCTOR",
    }),
    write = useOpsWrite(TripDto),
    [invalid, setInvalid] = useState(false);
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !write.isPending) close();
      }}
    >
      <DialogContent closeLabel={all("common.close")}>
        <DialogTitle>{t("assign")}</DialogTitle>
        <DialogDescription>{t("assignHint", { trip: trip.code })}</DialogDescription>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (write.isPending) return;
            const f = new FormData(e.currentTarget),
              b = AssignTripInput.safeParse({
                busId: f.get("bus"),
                driverId: f.get("driver"),
                ...(f.get("conductor") ? { conductorId: f.get("conductor") } : {}),
              });
            setInvalid(!b.success);
            if (!b.success) return;
            try {
              await write.mutateAsync({ path: "/ops/trips/" + trip.id + "/assign", body: b.data });
              close();
            } catch {
              /* Server availability failure stays visible. */
            }
          }}
        >
          <label className="flex flex-col gap-1">
            <span>{t("availableBus")}</span>
            <select className={inputClass} name="bus" required>
              <option value="">{t("selectOption")}</option>
              {buses.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.regNo}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span>{t("driver")}</span>
            <select className={inputClass} name="driver" required>
              <option value="">{t("selectOption")}</option>
              {drivers.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name ?? d.employeeCode}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span>{t("conductor")}</span>
            <select className={inputClass} name="conductor">
              <option value="">{t("selectOption")}</option>
              {conductors.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name ?? d.employeeCode}
                </option>
              ))}
            </select>
          </label>
          {buses.data?.length === 0 && <p>{t("noAvailableBuses")}</p>}
          {(buses.isError || drivers.isError || conductors.isError) && (
            <OpsError
              error={buses.error ?? drivers.error ?? conductors.error}
              retry={() => {
                void buses.refetch();
                void drivers.refetch();
                void conductors.refetch();
              }}
            />
          )}
          {invalid && <p role="alert">{t("invalidForm")}</p>}
          <WriteError error={write.error} />
          <Button
            type="submit"
            disabled={
              write.isPending || !buses.data?.length || drivers.isPending || conductors.isPending
            }
          >
            {t("saveAssignment")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
