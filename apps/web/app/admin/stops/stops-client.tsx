"use client";

import { useState } from "react";
import { z } from "zod";
import { AdminStopDto } from "@aptransit/shared";
import {
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Field,
  Input,
  Skeleton,
} from "@aptransit/ui";
import { useTranslations } from "next-intl";
import { useAdminMutation, useAdminQuery } from "../../../lib/admin";
import { OpsEmpty, OpsError, WriteError } from "../../ops/ops-common";
import { Edit2, MapPin, Plus } from "lucide-react";
import dynamic from "next/dynamic";

const MapView = dynamic(() => import("@aptransit/ui/map-view"), {
  ssr: false,
  loading: () => <Skeleton className="h-64 w-full" />,
});

export default function StopsClient() {
  const t = useTranslations("adminApp");
  const common = useTranslations("common");

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStop, setEditingStop] = useState<AdminStopDto | null>(null);

  // Form fields
  const [code, setCode] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [nameTe, setNameTe] = useState("");
  const [lat, setLat] = useState("15.8281");
  const [lng, setLng] = useState("78.0373");

  const {
    data: stops,
    isLoading,
    error,
    refetch,
  } = useAdminQuery("/admin/stops", z.array(AdminStopDto), search ? { q: search } : {});

  const createMutation = useAdminMutation<AdminStopDto>("POST", AdminStopDto);
  const patchMutation = useAdminMutation<AdminStopDto>("PATCH", AdminStopDto);

  const openCreateDialog = () => {
    setEditingStop(null);
    setCode("");
    setNameEn("");
    setNameTe("");
    setLat("15.8281");
    setLng("78.0373");
    setDialogOpen(true);
  };

  const openEditDialog = (stop: AdminStopDto) => {
    setEditingStop(stop);
    setCode(stop.code);
    setNameEn(stop.nameEn);
    setNameTe(stop.nameTe);
    setLat(String(stop.lat));
    setLng(String(stop.lng));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (isNaN(latNum) || isNaN(lngNum) || !nameEn.trim() || !nameTe.trim()) return;

    if (editingStop) {
      await patchMutation.mutateAsync({
        path: `/admin/stops/${editingStop.id}`,
        body: {
          nameEn: nameEn.trim(),
          nameTe: nameTe.trim(),
          lat: latNum,
          lng: lngNum,
        },
      });
    } else {
      if (!code.trim()) return;
      await createMutation.mutateAsync({
        path: "/admin/stops",
        body: {
          code: code.trim().toUpperCase(),
          nameEn: nameEn.trim(),
          nameTe: nameTe.trim(),
          districtId: stops?.[0]?.districtId || "districtknl000001",
          lat: latNum,
          lng: lngNum,
        },
      });
    }

    setDialogOpen(false);
    refetch();
  };

  const columns = [
    {
      id: "code",
      header: t("code"),
      cell: (s: AdminStopDto) => <span className="font-mono font-semibold">{s.code}</span>,
      sortValue: (s: AdminStopDto) => s.code,
    },
    {
      id: "nameEn",
      header: t("nameEn"),
      cell: (s: AdminStopDto) => s.nameEn,
      sortValue: (s: AdminStopDto) => s.nameEn,
    },
    {
      id: "nameTe",
      header: t("nameTe"),
      cell: (s: AdminStopDto) => s.nameTe,
      sortValue: (s: AdminStopDto) => s.nameTe,
    },
    {
      id: "coords",
      header: t("coordinates"),
      cell: (s: AdminStopDto) => (
        <span className="font-mono text-small text-muted">
          {s.lat.toFixed(4)}, {s.lng.toFixed(4)}
        </span>
      ),
    },
    {
      id: "actions",
      header: t("actions"),
      cell: (s: AdminStopDto) => (
        <Button
          variant="ghost"
          className="flex items-center gap-1"
          onClick={() => openEditDialog(s)}
        >
          <Edit2 className="h-3.5 w-3.5" />
          <span>{t("edit")}</span>
        </Button>
      ),
    },
  ];

  const currentLat = parseFloat(lat) || 15.8281;
  const currentLng = parseFloat(lng) || 78.0373;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <MapPin className="h-6 w-6 text-primary" />
            <h1 className="text-h1 font-bold">{t("stopsTitle")}</h1>
          </div>
          <p className="text-muted">{t("stopsDesc")}</p>
        </div>

        <Button variant="primary" className="flex items-center gap-2" onClick={openCreateDialog}>
          <Plus className="h-4 w-4" />
          <span>{t("addStop")}</span>
        </Button>
      </div>

      <div className="w-full max-w-sm">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchStopsPlaceholder")}
        />
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : error ? (
        <OpsError error={error} retry={refetch} />
      ) : (
        <DataTable
          label={t("stops")}
          columns={columns}
          rows={stops || []}
          rowKey={(s) => s.id}
          empty={<OpsEmpty />}
        />
      )}

      {/* Add / Edit Stop Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogTitle>{editingStop ? t("editStop") : t("addStop")}</DialogTitle>
          <DialogDescription>{t("stopDialogHint")}</DialogDescription>

          <div className="flex flex-col gap-4 py-3">
            {!editingStop && (
              <Field id="stop-code" label={t("code")}>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="KNL-BS"
                />
              </Field>
            )}

            {/* Bilingual name fields side by side */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="stop-name-en" label={t("nameEn")}>
                <Input
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  placeholder="Kurnool Bus Stand"
                />
              </Field>
              <Field id="stop-name-te" label={t("nameTe")}>
                <Input
                  value={nameTe}
                  onChange={(e) => setNameTe(e.target.value)}
                  placeholder="కర్నూలు బస్ స్టాండ్"
                />
              </Field>
            </div>

            {/* Coordinates */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="stop-lat" label={t("latitude")}>
                <Input
                  type="number"
                  step="0.0001"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  placeholder="15.8281"
                />
              </Field>
              <Field id="stop-lng" label={t("longitude")}>
                <Input
                  type="number"
                  step="0.0001"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  placeholder="78.0373"
                />
              </Field>
            </div>

            {/* Map Preview Pin */}
            <div className="mt-2 flex flex-col gap-1">
              <span className="text-small font-medium text-muted">{t("mapPreviewPin")}</span>
              <div className="h-44 w-full overflow-hidden rounded-md border border-default">
                <MapView
                  markers={[
                    {
                      id: "pin",
                      lng: currentLng,
                      lat: currentLat,
                      label: nameEn || "Stop",
                    },
                  ]}
                  center={{ lng: currentLng, lat: currentLat }}
                  zoom={12}
                />
              </div>
            </div>

            <WriteError error={createMutation.error || patchMutation.error} />

            <div className="flex justify-end gap-3 pt-3">
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                {common("close")}
              </Button>
              <Button
                variant="primary"
                onClick={handleSave}
                loading={createMutation.isPending || patchMutation.isPending}
                disabled={!nameEn.trim() || !nameTe.trim() || (!editingStop && !code.trim())}
              >
                {t("saveStop")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
