"use client";

import { useState } from "react";
import { z } from "zod";
import {
  AdminRouteDto,
  AdminTimetableDto,
  GenerateTripsDto,
  formatDate,
} from "@aptransit/shared";
import {
  Button,
  Card,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Field,
  Input,
  Select,
  SelectItem,
  Skeleton,
  Switch,
  toast,
} from "@aptransit/ui";
import { useLocale, useTranslations } from "next-intl";
import { useAdminMutation, useAdminQuery } from "../../../lib/admin";
import { useOpsBusTypes } from "../../../lib/ops";
import { OpsEmpty, OpsError, WriteError } from "../../ops/ops-common";
import { Clock, Plus, Zap } from "lucide-react";

const DAYS = [
  { bit: 1, label: "Mon" },
  { bit: 2, label: "Tue" },
  { bit: 4, label: "Wed" },
  { bit: 8, label: "Thu" },
  { bit: 16, label: "Fri" },
  { bit: 32, label: "Sat" },
  { bit: 64, label: "Sun" },
];

export default function TimetablesClient() {
  const t = useTranslations("adminApp");
  const common = useTranslations("common");
  const locale = useLocale();

  const { data: routes } = useAdminQuery("/admin/routes", z.array(AdminRouteDto));
  const { data: busTypes } = useOpsBusTypes();

  const [selectedRouteId, setSelectedRouteId] = useState<string>("");
  const activeRouteId = selectedRouteId || routes?.[0]?.id || "";

  const {
    data: allTimetables,
    isLoading,
    error,
    refetch,
  } = useAdminQuery("/admin/timetables", z.array(AdminTimetableDto));

  const [addOpen, setAddOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);

  // Add departure form
  const [departureTime, setDepartureTime] = useState("08:00");
  const [selectedBusTypeId, setSelectedBusTypeId] = useState("");
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 4, 8, 16, 32, 64]);
  const [validFrom] = useState("2026-01-01T00:00:00.000Z");

  // Generate trips form
  const [generateFrom, setGenerateFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [generateTo, setGenerateTo] = useState(() => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));

  const createMutation = useAdminMutation<AdminTimetableDto>("POST", AdminTimetableDto);
  const patchMutation = useAdminMutation<AdminTimetableDto>("PATCH", AdminTimetableDto);
  const generateMutation = useAdminMutation<GenerateTripsDto>("POST", GenerateTripsDto);

  const timetablesForRoute = (allTimetables || []).filter(
    (tt) => tt.routeId === activeRouteId,
  );

  const busTypeMap = new Map((busTypes || []).map((bt) => [bt.id, bt]));

  const toggleDay = (bit: number) => {
    if (selectedDays.includes(bit)) {
      if (selectedDays.length > 1) {
        setSelectedDays(selectedDays.filter((d) => d !== bit));
      }
    } else {
      setSelectedDays([...selectedDays, bit]);
    }
  };

  const handleCreateDeparture = async () => {
    const busType = selectedBusTypeId || busTypes?.[0]?.id;
    if (!busType || !departureTime) return;

    const daysMask = selectedDays.reduce((acc, d) => acc | d, 0);

    await createMutation.mutateAsync({
      path: "/admin/timetables",
      body: {
        routeId: activeRouteId,
        busTypeId: busType,
        departureLocal: departureTime,
        daysMask,
        validFrom,
        isActive: true,
      },
    });

    setAddOpen(false);
    refetch();
  };

  const handleToggleActive = async (tt: AdminTimetableDto) => {
    await patchMutation.mutateAsync({
      path: `/admin/timetables/${tt.id}`,
      body: {
        isActive: !tt.isActive,
      },
    });
    refetch();
  };

  const handleGenerateTrips = async () => {
    const res = await generateMutation.mutateAsync({
      path: "/admin/trips/generate",
      body: {
        from: generateFrom,
        to: generateTo,
      },
    });

    toast.success(t("generateSuccess", { count: res.count }));
    setGenerateOpen(false);
  };

  const columns = [
    {
      id: "departure",
      header: t("departure"),
      cell: (tt: AdminTimetableDto) => (
        <span className="font-mono text-body font-bold text-foreground">
          {tt.departureLocal}
        </span>
      ),
      sortValue: (tt: AdminTimetableDto) => tt.departureLocal,
    },
    {
      id: "busType",
      header: t("busType"),
      cell: (tt: AdminTimetableDto) => {
        const bt = busTypeMap.get(tt.busTypeId);
        return bt ? bt.nameEn : tt.busTypeId;
      },
    },
    {
      id: "days",
      header: t("operatingDays"),
      cell: (tt: AdminTimetableDto) => (
        <div className="flex flex-wrap gap-1">
          {DAYS.map((d) => {
            const isActive = (tt.daysMask & d.bit) !== 0;
            return (
              <span
                key={d.bit}
                className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "bg-muted/10 text-muted/40"
                }`}
              >
                {d.label}
              </span>
            );
          })}
        </div>
      ),
    },
    {
      id: "validity",
      header: t("validity"),
      cell: (tt: AdminTimetableDto) => (
        <span className="text-small text-muted">
          {formatDate(tt.validFrom, locale)}
          {tt.validTo ? ` to ${formatDate(tt.validTo, locale)}` : ""}
        </span>
      ),
    },
    {
      id: "active",
      header: t("status"),
      cell: (tt: AdminTimetableDto) => (
        <div className="flex items-center gap-2">
          <Switch
            checked={tt.isActive}
            onCheckedChange={() => handleToggleActive(tt)}
            aria-label={t("toggleActive")}
          />
          <span className="text-small">{tt.isActive ? t("active") : t("inactive")}</span>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="h-6 w-6 text-primary" />
            <h1 className="text-h1 font-bold">{t("timetablesTitle")}</h1>
          </div>
          <p className="text-muted">{t("timetablesDesc")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            className="flex items-center gap-2"
            onClick={() => setGenerateOpen(true)}
          >
            <Zap className="h-4 w-4" />
            <span>{t("generateTrips")}</span>
          </Button>

          <Button
            variant="primary"
            className="flex items-center gap-2"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-4 w-4" />
            <span>{t("addDeparture")}</span>
          </Button>
        </div>
      </div>

      {/* Route Selector */}
      <Card className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
        <span className="text-small font-semibold sm:w-32">{t("selectRoute")}:</span>
        <div className="w-full sm:max-w-md">
          <Select
            value={activeRouteId}
            onValueChange={setSelectedRouteId}
          >
            {routes?.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.code} · {r.nameEn}
              </SelectItem>
            ))}
          </Select>
        </div>
      </Card>

      {/* Departures Table */}
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : error ? (
        <OpsError error={error} retry={refetch} />
      ) : (
        <DataTable
          label={t("timetables")}
          columns={columns}
          rows={timetablesForRoute}
          rowKey={(tt) => tt.id}
          empty={<OpsEmpty />}
        />
      )}

      {/* Add Departure Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogTitle>{t("addDeparture")}</DialogTitle>
          <DialogDescription>{t("addDepartureHint")}</DialogDescription>

          <div className="flex flex-col gap-4 py-3">
            <Field id="tt-departure-time" label={t("departureTime")}>
              <Input
                type="time"
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
              />
            </Field>

            <Field id="tt-bus-type" label={t("busType")}>
              <Select
                value={selectedBusTypeId || busTypes?.[0]?.id || ""}
                onValueChange={setSelectedBusTypeId}
              >
                {busTypes?.map((bt) => (
                  <SelectItem key={bt.id} value={bt.id}>
                    {bt.nameEn}
                  </SelectItem>
                ))}
              </Select>
            </Field>

            <div className="flex flex-col gap-1.5">
              <span className="text-small font-medium">{t("operatingDays")}</span>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((d) => {
                  const isSelected = selectedDays.includes(d.bit);
                  return (
                    <button
                      type="button"
                      key={d.bit}
                      onClick={() => toggleDay(d.bit)}
                      className={`rounded-md px-3 py-1.5 text-small font-medium transition-colors ${
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "border border-border bg-surface text-muted hover:border-foreground/30"
                      }`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <WriteError error={createMutation.error} />

            <div className="flex justify-end gap-3 pt-3">
              <Button variant="ghost" onClick={() => setAddOpen(false)}>
                {common("close")}
              </Button>
              <Button
                variant="primary"
                onClick={handleCreateDeparture}
                loading={createMutation.isPending}
              >
                {t("saveDeparture")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Generate Trips Dialog */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent>
          <DialogTitle>{t("generateTrips")}</DialogTitle>
          <DialogDescription>{t("generateTripsHint")}</DialogDescription>

          <div className="flex flex-col gap-4 py-3">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="tt-gen-from" label={t("fromDate")}>
                <Input
                  type="date"
                  value={generateFrom}
                  onChange={(e) => setGenerateFrom(e.target.value)}
                />
              </Field>

              <Field id="tt-gen-to" label={t("toDate")}>
                <Input
                  type="date"
                  value={generateTo}
                  onChange={(e) => setGenerateTo(e.target.value)}
                />
              </Field>
            </div>

            <WriteError error={generateMutation.error} />

            <div className="flex justify-end gap-3 pt-3">
              <Button variant="ghost" onClick={() => setGenerateOpen(false)}>
                {common("close")}
              </Button>
              <Button
                variant="primary"
                onClick={handleGenerateTrips}
                loading={generateMutation.isPending}
              >
                <Zap className="mr-2 h-4 w-4" />
                <span>{t("generateAction")}</span>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
