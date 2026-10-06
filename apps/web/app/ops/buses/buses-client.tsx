"use client";
import { useState } from "react";
import { z } from "zod";
import {
  BusDto,
  BusStatus,
  OpsBusInput,
  busDisplayStatus,
  can,
  formatDate,
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
import {
  useOpsBusTypes,
  useOpsDepots,
  useOpsFilters,
  useOpsLive,
  useOpsQuery,
} from "../../../lib/ops";
import {
  FilterSelect,
  inputClass,
  OpsEmpty,
  OpsError,
  useOpsWrite,
  WriteError,
} from "../ops-common";
export default function BusesClient() {
  const t = useTranslations("opsApp"),
    all = useTranslations(),
    locale = useLocale(),
    me = useMe(),
    { depotId, params, set } = useOpsFilters();
  useOpsLive(depotId);
  const buses = useOpsQuery("/ops/buses", z.array(BusDto), {
      depotId,
      status: params.get("status") ?? undefined,
      q: params.get("q") ?? undefined,
    }),
    types = useOpsBusTypes(),
    depots = useOpsDepots(),
    write = useOpsWrite(BusDto);
  const [open, setOpen] = useState(false),
    [invalid, setInvalid] = useState(false);
  const columns = [
    {
      id: "reg",
      header: t("bus"),
      cell: (b: BusDto) => b.regNo,
      sortValue: (b: BusDto) => b.regNo,
    },
    {
      id: "type",
      header: t("type"),
      cell: (b: BusDto) => all("serviceType." + b.serviceType),
      sortValue: (b: BusDto) => b.serviceType,
    },
    {
      id: "status",
      header: t("status"),
      cell: (b: BusDto) => (
        <StatusBadge
          status={busDisplayStatus(b.status)}
          label={all("status." + busDisplayStatus(b.status))}
        />
      ),
    },
    {
      id: "route",
      header: t("route"),
      cell: (b: BusDto) =>
        (locale === "te" ? b.currentRouteNameTe : b.currentRouteNameEn) ?? t("unassigned"),
    },
    { id: "driver", header: t("driver"), cell: (b: BusDto) => b.driverName ?? t("unassigned") },
    {
      id: "maintenance",
      header: t("maintenanceDue"),
      cell: (b: BusDto) =>
        b.maintenanceDueAt ? formatDate(b.maintenanceDueAt, locale) : t("unassigned"),
      sortValue: (b: BusDto) => b.maintenanceDueAt,
    },
  ];
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-h1">{t("buses")}</h1>
        {can(me.data?.roles.map((r) => r.role) ?? [], "fleet:write") && (
          <Button
            onClick={() => {
              write.reset();
              setOpen(true);
            }}
          >
            {t("addBus")}
          </Button>
        )}
      </div>
      {buses.isError ? (
        <OpsError error={buses.error} retry={() => void buses.refetch()} />
      ) : (
        <DataTable
          label={t("buses")}
          columns={columns}
          rows={buses.data ?? []}
          rowKey={(b) => b.id}
          loading={buses.isPending}
          empty={<OpsEmpty />}
          filters={
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-small">
                <span>{t("searchBus")}</span>
                <input
                  className={inputClass}
                  value={params.get("q") ?? ""}
                  onChange={(e) => set("q", e.target.value)}
                  maxLength={80}
                />
              </label>
              <FilterSelect
                label={t("status")}
                value={params.get("status") ?? ""}
                onChange={(v) => set("status", v)}
              >
                <option value="">{t("allStatuses")}</option>
                {BusStatus.options.map((s) => (
                  <option key={s} value={s}>
                    {all("status." + busDisplayStatus(s))}
                  </option>
                ))}
              </FilterSelect>
            </div>
          }
        />
      )}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!write.isPending) setOpen(v);
        }}
      >
        <DialogContent closeLabel={all("common.close")}>
          <DialogTitle>{t("addBus")}</DialogTitle>
          <DialogDescription>{t("addBusHint")}</DialogDescription>
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (write.isPending) return;
              const f = new FormData(e.currentTarget),
                body = OpsBusInput.safeParse({
                  regNo: f.get("regNo"),
                  busTypeId: f.get("busTypeId"),
                  depotId: f.get("depotId"),
                });
              setInvalid(!body.success);
              if (!body.success) return;
              try {
                await write.mutateAsync({ path: "/ops/buses", body: body.data });
                setOpen(false);
              } catch {
                /* Keep entered fields for retry. */
              }
            }}
          >
            <label className="flex flex-col gap-1">
              <span>{t("bus")}</span>
              <input name="regNo" className={inputClass} required minLength={5} maxLength={24} />
            </label>
            <label className="flex flex-col gap-1">
              <span>{t("type")}</span>
              <select name="busTypeId" className={inputClass} required>
                <option value="">{t("selectOption")}</option>
                {types.data?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {locale === "te" ? b.nameTe : b.nameEn}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span>{t("depot")}</span>
              <select
                name="depotId"
                className={inputClass}
                required
                defaultValue={depotId ?? me.data?.roles.find((r) => r.depotId)?.depotId ?? ""}
              >
                <option value="">{t("selectOption")}</option>
                {depots.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {locale === "te" ? d.nameTe : d.nameEn}
                  </option>
                ))}
              </select>
            </label>
            {(types.isError || depots.isError) && (
              <OpsError
                error={types.error ?? depots.error}
                retry={() => {
                  void types.refetch();
                  void depots.refetch();
                }}
              />
            )}
            {invalid && <p role="alert">{t("invalidForm")}</p>}
            <WriteError error={write.error} />
            <Button type="submit" disabled={write.isPending || types.isPending || depots.isPending}>
              {t("saveBus")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
