"use client";

import { useState } from "react";
import {
  BusProfileDto,
  formatDate,
  formatTime,
  busDisplayStatus,
  type OpsTripDto,
  type MaintenanceDto,
} from "@aptransit/shared";
import {
  Button,
  Card,
  DataTable,
  type DataColumn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Field,
  Input,
  Select,
  SelectItem,
  Skeleton,
  StatusBadge,
  Textarea,
} from "@aptransit/ui";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useOpsDepots, useOpsQuery } from "../../../../lib/ops";
import { OpsEmpty, OpsError, useOpsWrite, WriteError } from "../../ops-common";
import { Wrench, ArrowLeft } from "lucide-react";

export default function BusProfileClient({ id }: { id: string }) {
  const t = useTranslations("opsApp");
  const common = useTranslations("common");
  const locale = useLocale();

  const {
    data: bus,
    isLoading,
    error,
    refetch,
  } = useOpsQuery(`/ops/buses/${id}`, BusProfileDto);
  const depots = useOpsDepots();

  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [maintenanceType, setMaintenanceType] = useState<"ROUTINE" | "REPAIR" | "INSPECTION">("ROUTINE");
  const [notes, setNotes] = useState("");
  const [costRupees, setCostRupees] = useState("");

  const maintenanceMutation = useOpsWrite(BusProfileDto);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !bus) {
    return (
      <div className="p-6">
        <OpsError error={error} retry={refetch} />
      </div>
    );
  }

  const depot = depots.data?.find((d) => d.id === bus.depotId);
  const activeTrip = bus.trips.find((tr) => tr.status === "RUNNING");

  const handleSaveMaintenance = async () => {
    const costPaise = costRupees ? Math.round(parseFloat(costRupees) * 100) : 0;
    await maintenanceMutation.mutateAsync({
      path: `/ops/buses/${id}/maintenance`,
      body: {
        type: maintenanceType,
        notes: notes.trim() || undefined,
        costPaise,
      },
    });
    setMaintenanceOpen(false);
    setNotes("");
    setCostRupees("");
    refetch();
  };

  const tripColumns: DataColumn<OpsTripDto>[] = [
    {
      id: "code",
      header: t("code"),
      cell: (tr: OpsTripDto) => (
        <Link href={`/ops/trips/${tr.id}`} className="font-semibold text-primary hover:underline">
          {tr.code}
        </Link>
      ),
      sortValue: (tr: OpsTripDto) => tr.code,
    },
    {
      id: "route",
      header: t("route"),
      cell: (tr: OpsTripDto) => (locale === "te" ? tr.routeNameTe : tr.routeNameEn),
      sortValue: (tr: OpsTripDto) => tr.routeNameEn,
    },
    {
      id: "departure",
      header: t("departure"),
      cell: (tr: OpsTripDto) => formatTime(tr.scheduledDepartureAt),
      sortValue: (tr: OpsTripDto) => tr.scheduledDepartureAt,
    },
    {
      id: "status",
      header: t("status"),
      cell: (tr: OpsTripDto) => <StatusBadge status={tr.displayStatus} label={tr.displayStatus} />,
    },
    {
      id: "delay",
      header: t("delay"),
      cell: (tr: OpsTripDto) => tr.delayMinutes,
    },
    {
      id: "passengers",
      header: t("passengers"),
      cell: (tr: OpsTripDto) => tr.passengers,
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Back button */}
      <div>
        <Link
          href="/ops/buses"
          className="inline-flex items-center gap-2 text-small font-medium text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{t("buses")}</span>
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-h1 font-bold">{bus.regNo}</h1>
            <StatusBadge status={busDisplayStatus(bus.status)} label={busDisplayStatus(bus.status)} />
          </div>
          <p className="text-muted">
            {bus.serviceType} · {depot ? (locale === "te" ? depot.nameTe : depot.nameEn) : bus.depotId}
          </p>
        </div>

        <Button
          variant="secondary"
          className="flex items-center gap-2"
          onClick={() => setMaintenanceOpen(true)}
        >
          <Wrench className="h-4 w-4" />
          <span>{t("setMaintenance")}</span>
        </Button>
      </div>

      {/* Facts grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="flex flex-col p-4">
          <span className="text-small text-muted">{t("driver")}</span>
          <span className="text-body font-semibold">
            {activeTrip?.assignment?.driverId ? activeTrip.assignment.driverId : t("unassigned")}
          </span>
        </Card>

        <Card className="flex flex-col p-4">
          <span className="text-small text-muted">{t("conductor")}</span>
          <span className="text-body font-semibold">
            {activeTrip?.assignment?.conductorId ? activeTrip.assignment.conductorId : t("unassigned")}
          </span>
        </Card>

        <Card className="flex flex-col p-4">
          <span className="text-small text-muted">{t("route")}</span>
          <span className="text-body font-semibold">
            {activeTrip ? (locale === "te" ? activeTrip.routeNameTe : activeTrip.routeNameEn) : t("unassigned")}
          </span>
        </Card>

        <Card className="flex flex-col p-4">
          <span className="text-small text-muted">{t("maintenanceDue")}</span>
          <span className="text-body font-semibold">
            {bus.maintenanceDueAt ? formatDate(bus.maintenanceDueAt, locale) : common("notAvailable")}
          </span>
        </Card>
      </div>

      {/* Trip history section */}
      <div className="flex flex-col gap-3">
        <h2 className="text-h2 font-semibold">{t("tripHistory")}</h2>
        <DataTable
          label={t("tripHistory")}
          columns={tripColumns}
          rows={bus.trips}
          rowKey={(tr) => tr.id}
          empty={<OpsEmpty />}
        />
      </div>

      {/* Maintenance records section */}
      <div className="flex flex-col gap-3">
        <h2 className="text-h2 font-semibold">{t("maintenanceRecords")}</h2>
        {bus.maintenance.length === 0 ? (
          <Card className="p-6 text-center text-muted">{t("noMaintenanceRecords")}</Card>
        ) : (
          <div className="flex flex-col gap-3">
            {bus.maintenance.map((m: MaintenanceDto) => (
              <Card key={m.id} className="flex flex-col gap-2 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{m.kind}</span>
                  <span className="text-small text-muted">{formatDate(m.startAt, locale)}</span>
                </div>
                {m.note && <p className="text-body text-muted">{m.note}</p>}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Set maintenance Dialog */}
      <Dialog open={maintenanceOpen} onOpenChange={setMaintenanceOpen}>
        <DialogContent>
          <DialogTitle>{t("setMaintenance")}</DialogTitle>
          <DialogDescription>{t("setMaintenanceHint")}</DialogDescription>

          <div className="flex flex-col gap-4 py-4">
            <Field id="bus-maint-type" label={t("type")}>
              <Select
                value={maintenanceType}
                onValueChange={(val: string) => setMaintenanceType(val as "ROUTINE" | "REPAIR" | "INSPECTION")}
              >
                <SelectItem value="ROUTINE">ROUTINE</SelectItem>
                <SelectItem value="REPAIR">REPAIR</SelectItem>
                <SelectItem value="INSPECTION">INSPECTION</SelectItem>
              </Select>
            </Field>

            <Field id="bus-maint-notes" label={t("notes")}>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("notesPlaceholder")}
              />
            </Field>

            <Field id="bus-maint-cost" label={t("costRupees")}>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={costRupees}
                onChange={(e) => setCostRupees(e.target.value)}
                placeholder="0.00"
              />
            </Field>

            <WriteError error={maintenanceMutation.error} />

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setMaintenanceOpen(false)}>
                {common("close")}
              </Button>
              <Button
                variant="primary"
                onClick={handleSaveMaintenance}
                loading={maintenanceMutation.isPending}
              >
                {t("saveMaintenance")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
