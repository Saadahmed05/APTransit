"use client";

import { TripDto } from "@aptransit/shared";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorState,
  Skeleton,
  toast,
  ToneChip,
} from "@aptransit/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CloudOff, MapPin, Satellite, SatelliteDish, TriangleAlert, WifiOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorKey } from "../../../../lib/api";
import { useDeviceKey } from "../../../../lib/driver-device";
import { type GpsStatus, useGpsSender } from "../../../../lib/use-gps-sender";
import { useWakeLock } from "../../../../lib/use-wake-lock";

import { useLiveTrip } from "../../../../lib/use-live-trip";
const GPS_LOOK = {
  ACTIVE: { tone: "success", icon: Satellite },
  WEAK: { tone: "warning", icon: SatelliteDish },
  OFF: { tone: "danger", icon: WifiOff },
} as const satisfies Record<GpsStatus, unknown>;

/** Glance only: everything fits at 360 x 640 without scrolling (docs/11 Driver). */
export function DriverTrip({ tripId }: { tripId: string }) {
  const t = useTranslations("driverApp");
  const tRoot = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const deviceKey = useDeviceKey();
  const [endOpen, setEndOpen] = useState(false);

  const live = useLiveTrip(tripId);
  const running = live.data?.status === "RUNNING";
  const gps = useGpsSender({ tripId, deviceKey, enabled: running });
  const wake = useWakeLock(running);

  const end = useMutation({
    mutationFn: () => api(`/driver/trips/${tripId}/end`, { method: "POST", schema: TripDto }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["driver"] });
      toast.success(t("trip.ended"));
      router.replace("/driver");
    },
  });

  if (live.isLoading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <span className="sr-only" role="status">
          {tRoot("common.loading")}
        </span>
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-md" />
      </div>
    );
  }
  if (live.isError || !live.data) {
    return (
      <ErrorState
        headingLevel="h1"
        title={t("errorTitle")}
        message={tRoot(errorKey(live.error, (k) => tRoot.has(k)))}
        retryLabel={tRoot("common.retry")}
        onRetry={() => void live.refetch()}
      />
    );
  }

  const data = live.data;
  const pick = (p: { nameEn: string; nameTe: string }) => (locale === "te" ? p.nameTe : p.nameEn);
  const look = GPS_LOOK[gps.status];
  const etaMinutes = data.etaNextStopSec === null ? null : Math.round(data.etaNextStopSec / 60);
  const lastStop = data.progress.at(-1);
  const endAt = data.nextStop ? pick(data.nextStop) : lastStop ? pick(lastStop) : "";

  if (!running) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-h1 text-fg">{t("trip.notRunning")}</h1>
        <Button asChild size="xl" variant="secondary">
          <Link href="/driver">{t("setup.back")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h1 text-fg">{t("trip.active")}</h1>
        <ToneChip tone={look.tone} icon={look.icon} label={`${t("trip.gps")}: ${t(`trip.gpsStates.${gps.status}`)}`} size="md" />
      </div>

      <section aria-labelledby="next-stop" className="flex flex-col gap-1 rounded-lg border border-default bg-surface-raised p-4">
        <h2 id="next-stop" className="text-body-lg text-muted">
          {t("trip.nextStop")}
        </h2>
        {data.nextStop ? (
          <>
            <p className="flex items-center gap-2 text-h2 text-fg">
              <MapPin className="size-6 shrink-0 text-primary" aria-hidden="true" />
              {pick(data.nextStop)}
            </p>
            <p className="text-h3 tabular-nums text-fg">{etaMinutes !== null && etaMinutes > 0 ? t("trip.eta", { minutes: etaMinutes }) : t("trip.arriving")}</p>
          </>
        ) : (
          <p className="text-h2 text-fg">{t("trip.lastStop")}</p>
        )}
      </section>

      {/* Problems the driver must know at a glance */}
      {!deviceKey && <p className="text-body-lg text-status-danger">{t("trip.noDevice")}</p>}
      {gps.stoppedCode && <p className="text-body-lg text-status-danger">{t("trip.stopped")}</p>}
      {gps.buffered > 0 && (
        <p className="flex items-center gap-2 text-body text-status-warning" role="status">
          <CloudOff className="size-5" aria-hidden="true" />
          {t("trip.buffered", { count: gps.buffered })}
        </p>
      )}
      {!wake.supported && <p className="text-body text-muted">{t("trip.wakeTip")}</p>}

      <Button asChild size="xl" variant="secondary">
        <Link href="/driver/report">
          <TriangleAlert className="size-5" aria-hidden="true" />
          {t("trip.report")}
        </Link>
      </Button>
      <Button size="xl" variant="danger" onClick={() => setEndOpen(true)}>
        {t("trip.end")}
      </Button>

      <Dialog open={endOpen} onOpenChange={setEndOpen}>
        <DialogContent closeLabel={tRoot("common.close")}>
          <DialogHeader>
            <DialogTitle>{t("trip.endTitle", { stop: endAt })}</DialogTitle>
            <DialogDescription>{t("trip.endBody")}</DialogDescription>
          </DialogHeader>
          {end.error && (
            <p role="alert" className="text-body text-status-danger">
              {tRoot(errorKey(end.error, (k) => tRoot.has(k)))}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" size="xl" onClick={() => setEndOpen(false)}>
              {t("trip.keepGoing")}
            </Button>
            <Button variant="danger" size="xl" loading={end.isPending} onClick={() => end.mutate()}>
              {t("trip.end")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
