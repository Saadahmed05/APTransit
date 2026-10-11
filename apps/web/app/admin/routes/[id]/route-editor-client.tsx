"use client";

import { useState } from "react";
import { z } from "zod";
import {
  AdminRouteDto,
  AdminStopDto,
  type AdminRouteStop,
} from "@aptransit/shared";
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Skeleton,
} from "@aptransit/ui";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useAdminMutation, useAdminQuery } from "../../../../lib/admin";
import { OpsError, WriteError } from "../../../ops/ops-common";
import { ArrowDown, ArrowLeft, ArrowUp, Check, Save } from "lucide-react";
import dynamic from "next/dynamic";

const MapView = dynamic(() => import("@aptransit/ui/map-view"), {
  ssr: false,
  loading: () => <Skeleton className="h-64 w-full" />,
});

export default function RouteEditorClient({ id }: { id: string }) {
  const t = useTranslations("adminApp");
  const common = useTranslations("common");

  const {
    data: route,
    isLoading: isRouteLoading,
    error: routeError,
    refetch,
  } = useAdminQuery(`/admin/routes/${id}`, AdminRouteDto);

  const { data: allStops } = useAdminQuery("/admin/stops", z.array(AdminStopDto));

  const [stops, setStops] = useState<AdminRouteStop[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [prevRoute, setPrevRoute] = useState<AdminRouteDto | null>(null);
  if (route && route !== prevRoute) {
    setPrevRoute(route);
    setStops(route.stops);
  }

  const patchMutation = useAdminMutation<AdminRouteDto>("PATCH", AdminRouteDto);

  if (isRouteLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (routeError || !route) {
    return (
      <div className="p-6">
        <OpsError error={routeError} retry={refetch} />
      </div>
    );
  }

  const stopMap = new Map((allStops || []).map((s) => [s.id, s]));

  const moveUp = (index: number) => {
    if (index <= 0) return;
    const next = [...stops];
    const temp = next[index - 1]!;
    next[index - 1] = next[index]!;
    next[index] = temp;
    setStops(next);
  };

  const moveDown = (index: number) => {
    if (index >= stops.length - 1) return;
    const next = [...stops];
    const temp = next[index + 1]!;
    next[index + 1] = next[index]!;
    next[index] = temp;
    setStops(next);
  };

  const updateKm = (index: number, val: number) => {
    const next = [...stops];
    next[index] = { ...next[index]!, kmFromOrigin: val };
    setStops(next);
  };

  const updateMin = (index: number, val: number) => {
    const next = [...stops];
    next[index] = { ...next[index]!, minutesFromOrigin: val };
    setStops(next);
  };

  const validateStops = (): boolean => {
    if (stops.length < 2) {
      setValidationError(t("atLeastTwoStops"));
      return false;
    }
    if (stops[0]!.kmFromOrigin !== 0 || stops[0]!.minutesFromOrigin !== 0) {
      setValidationError(t("firstStopZero"));
      return false;
    }
    for (let i = 1; i < stops.length; i++) {
      if (stops[i]!.kmFromOrigin <= stops[i - 1]!.kmFromOrigin) {
        setValidationError(t("kmMustIncrease"));
        return false;
      }
      if (stops[i]!.minutesFromOrigin <= stops[i - 1]!.minutesFromOrigin) {
        setValidationError(t("minMustIncrease"));
        return false;
      }
    }
    setValidationError(null);
    return true;
  };

  const handleOpenConfirm = () => {
    if (validateStops()) {
      setConfirmOpen(true);
    }
  };

  const handleSave = async () => {
    await patchMutation.mutateAsync({
      path: `/admin/routes/${id}`,
      body: {
        stops,
      },
    });

    setConfirmOpen(false);
    refetch();
  };

  // Markers for Map preview
  const markers = stops
    .map((s, idx) => {
      const stopInfo = stopMap.get(s.stopId);
      if (!stopInfo) return null;
      return {
        id: `stop-${idx}`,
        lat: stopInfo.lat,
        lng: stopInfo.lng,
        label: `${idx + 1}. ${stopInfo.nameEn}`,
      };
    })
    .filter(Boolean) as Array<{ id: string; lat: number; lng: number; label: string }>;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Back link */}
      <div>
        <Link
          href="/admin/routes"
          className="inline-flex items-center gap-2 text-small font-medium text-muted hover:text-fg"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{t("routesTitle")}</span>
        </Link>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h1 font-bold">{route.code}</h1>
          <p className="text-muted">
            {route.nameEn} ({route.nameTe}) · {route.distanceKm} km
          </p>
        </div>

        <Button variant="primary" className="flex items-center gap-2" onClick={handleOpenConfirm}>
          <Save className="h-4 w-4" />
          <span>{t("saveChanges")}</span>
        </Button>
      </div>

      {validationError && (
        <div className="rounded-md border border-status-danger bg-status-danger-soft p-4 text-status-danger font-medium">
          {validationError}
        </div>
      )}

      {/* Map Preview */}
      <Card className="flex flex-col gap-2 p-4">
        <h2 className="text-body font-semibold">{t("routeMapPreview")}</h2>
        <div className="h-56 w-full overflow-hidden rounded-md border border-default">
          <MapView
            polyline={route.polyline}
            markers={markers}
            fitBounds={markers.length > 0}
          />
        </div>
      </Card>

      {/* Ordered Stop Editor List */}
      <div className="flex flex-col gap-3">
        <h2 className="text-h2 font-semibold">{t("orderedStops")}</h2>
        <p className="text-small text-muted">{t("orderedStopsHint")}</p>

        <div className="flex flex-col gap-2">
          {stops.map((s, idx) => {
            const stopInfo = stopMap.get(s.stopId);
            const isFirst = idx === 0;
            const isLast = idx === stops.length - 1;

            return (
              <Card key={`${s.stopId}-${idx}`} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-small font-bold text-primary">
                    {idx + 1}
                  </span>
                  <div>
                    <span className="font-semibold">{stopInfo ? stopInfo.nameEn : s.stopId}</span>
                    <p className="text-small text-muted">{stopInfo ? stopInfo.nameTe : ""}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  {/* kmFromOrigin */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-small text-muted">km:</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.1"
                      disabled={isFirst}
                      value={s.kmFromOrigin}
                      onChange={(e) => updateKm(idx, parseFloat(e.target.value) || 0)}
                      className="w-20"
                    />
                  </div>

                  {/* minutesFromOrigin */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-small text-muted">min:</span>
                    <Input
                      type="number"
                      min="0"
                      disabled={isFirst}
                      value={s.minutesFromOrigin}
                      onChange={(e) => updateMin(idx, parseInt(e.target.value, 10) || 0)}
                      className="w-20"
                    />
                  </div>

                  {/* Move Up and Move Down buttons */}
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      disabled={isFirst}
                      onClick={() => moveUp(idx)}
                      aria-label={t("moveUp")}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={isLast}
                      onClick={() => moveDown(idx)}
                      aria-label={t("moveDown")}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogTitle>{t("saveRouteChangesTitle")}</DialogTitle>
          <DialogDescription>
            {t("saveRouteChangesSummary", {
              stopsCount: stops.length,
              totalKm: stops[stops.length - 1]?.kmFromOrigin || 0,
              totalMin: stops[stops.length - 1]?.minutesFromOrigin || 0,
            })}
          </DialogDescription>

          <WriteError error={patchMutation.error} />

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              {common("close")}
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              loading={patchMutation.isPending}
            >
              <Check className="mr-2 h-4 w-4" />
              <span>{t("confirmSave")}</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
