"use client";

import { formatTime, PLATFORM_TIME_ZONE, TripDto } from "@aptransit/shared";
import { Button, Card, EmptyState, ErrorState, Skeleton, ToneChip } from "@aptransit/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bus, CalendarX, CircleCheck, Clock, LocateFixed, MapPinOff, ShieldAlert, Smartphone } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorKey, isApiError } from "../../lib/api";
import { useDriverToday } from "../../lib/driver-today";
import { useNow } from "../../lib/use-browser-state";

type LocationStep = "idle" | "explain" | "asking" | "denied";

/** Hour of the day in IST, for the greeting. */
function istHour(now: number): number {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: PLATFORM_TIME_ZONE }).format(new Date(now)));
}

export function DriverHome() {
  const t = useTranslations("driverApp");
  const tRoot = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const now = useNow(30_000);
  const today = useDriverToday(30_000);
  const [location, setLocation] = useState<LocationStep>("idle");

  const start = useMutation({
    mutationFn: (tripId: string) => api(`/driver/trips/${tripId}/start`, { method: "POST", schema: TripDto }),
    onSuccess: (trip) => {
      void queryClient.invalidateQueries({ queryKey: ["driver"] });
      router.push(`/driver/trip/${trip.id}`);
    },
  });

  if (today.isLoading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <span className="sr-only" role="status">
          {tRoot("common.loading")}
        </span>
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-md" />
      </div>
    );
  }
  if (today.isError || !today.data) {
    return (
      <ErrorState
        headingLevel="h1"
        title={t("errorTitle")}
        message={tRoot(errorKey(today.error, (k) => tRoot.has(k)))}
        retryLabel={tRoot("common.retry")}
        onRetry={() => void today.refetch()}
      />
    );
  }

  const data = today.data;
  const part = now ? (istHour(now) < 12 ? "morning" : istHour(now) < 17 ? "afternoon" : "evening") : "morning";
  const firstName = data.driverName?.split(" ").at(-1) ?? null;
  const greeting = firstName ? t(`greeting.${part}`, { name: firstName }) : t(`greetingNoName.${part}`);
  const pick = (p: { nameEn: string; nameTe: string }) => (locale === "te" ? p.nameTe : p.nameEn);

  // Device state for this phone (docs/11 /driver)
  const deviceCard =
    !today.deviceKey || data.thisDevice === null ? (
      <Card padding="md" className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-h3 text-fg">
          <Smartphone className="size-5 text-muted" aria-hidden="true" />
          {t("device.notRegisteredTitle")}
        </h2>
        <p className="text-body-lg text-muted">{data.deviceApproved ? t("device.otherPhoneHint") : t("device.notRegisteredHint")}</p>
        <Button asChild size="xl" variant="secondary">
          <Link href="/driver/setup">{t("device.setup")}</Link>
        </Button>
      </Card>
    ) : data.thisDevice === "PENDING" ? (
      <Card padding="md" className="flex flex-col gap-2" role="status">
        <h2 className="flex items-center gap-2 text-h3 text-fg">
          <Clock className="size-5 text-status-warning" aria-hidden="true" />
          {t("device.pendingTitle")}
        </h2>
        <p className="text-body-lg text-muted">{t("device.pendingHint")}</p>
      </Card>
    ) : null;
  const deviceReady = Boolean(today.deviceKey) && data.thisDevice === "APPROVED";

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-h1 text-fg">{greeting}</h1>

      {!data.trip ? (
        <EmptyState icon={CalendarX} title={t("noTripTitle")} hint={t("noTripHint")} headingLevel="h2" />
      ) : (
        <TripCard
          trip={data.trip}
          busRegNo={data.bus?.regNo ?? null}
          routeName={data.route ? pick(data.route) : ""}
          departure={formatTime(data.trip.scheduledDepartureAt, locale)}
        />
      )}

      {deviceCard}
      {deviceReady && (
        <p className="flex items-center gap-2 text-body text-status-success">
          <CircleCheck className="size-5" aria-hidden="true" />
          {t("device.approved")}
        </p>
      )}

      {data.trip?.status === "RUNNING" && (
        <Button asChild size="xl">
          <Link href={`/driver/trip/${data.trip.id}`}>{t("continueTrip")}</Link>
        </Button>
      )}

      {data.trip?.status === "SCHEDULED" && (
        <StartTrip
          tripId={data.trip.id}
          startableFrom={data.startableFrom}
          now={now}
          deviceReady={deviceReady}
          location={location}
          setLocation={setLocation}
          starting={start.isPending}
          error={start.error}
          onStart={() => start.mutate(data.trip!.id)}
        />
      )}
    </div>
  );
}

function TripCard({ trip, busRegNo, routeName, departure }: { trip: TripDto; busRegNo: string | null; routeName: string; departure: string }) {
  const t = useTranslations("driverApp");
  return (
    <Card padding="lg" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-h2 text-fg">
          <Bus className="size-6 text-primary" aria-hidden="true" />
          {busRegNo ? t("bus", { regNo: busRegNo }) : t("busPending")}
        </p>
        <ToneChip
          tone={trip.status === "RUNNING" ? "info" : "success"}
          icon={trip.status === "RUNNING" ? Bus : CircleCheck}
          label={trip.status === "RUNNING" ? t("running") : t("ready")}
        />
      </div>
      <p className="text-h3 text-fg">{routeName}</p>
      <p className="text-body-lg tabular-nums text-muted">{t("departs", { time: departure })}</p>
    </Card>
  );
}

function StartTrip(props: {
  tripId: string;
  startableFrom: string | null;
  now: number;
  deviceReady: boolean;
  location: LocationStep;
  setLocation: (step: LocationStep) => void;
  starting: boolean;
  error: unknown;
  onStart: () => void;
}) {
  const t = useTranslations("driverApp");
  const tRoot = useTranslations();
  const locale = useLocale();
  const { startableFrom, now, deviceReady, location, setLocation, starting, error, onStart } = props;
  const tooEarly = startableFrom !== null && now > 0 && now < Date.parse(startableFrom);

  // Location first, with a plain explanation, before the browser asks (docs/11, Day 11 prompt)
  const begin = async () => {
    try {
      const state = await navigator.permissions?.query({ name: "geolocation" });
      if (state?.state === "granted") return onStart();
      if (state?.state === "denied") return setLocation("denied");
    } catch {
      // Permissions API missing: ask through the explanation step
    }
    setLocation("explain");
  };
  const ask = () => {
    setLocation("asking");
    navigator.geolocation.getCurrentPosition(
      () => {
        setLocation("idle");
        onStart();
      },
      (err) => setLocation(err.code === err.PERMISSION_DENIED ? "denied" : "idle"),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  if (location === "explain" || location === "asking") {
    return (
      <Card padding="lg" className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-h2 text-fg">
          <LocateFixed className="size-6 text-primary" aria-hidden="true" />
          {t("location.explainTitle")}
        </h2>
        <p className="text-body-lg text-muted">{t("location.explainBody")}</p>
        <Button size="xl" loading={location === "asking"} onClick={ask}>
          {t("location.allow")}
        </Button>
      </Card>
    );
  }

  if (location === "denied") {
    return (
      <Card padding="lg" className="flex flex-col gap-4" role="alert">
        <h2 className="flex items-center gap-2 text-h2 text-fg">
          <MapPinOff className="size-6 text-status-danger" aria-hidden="true" />
          {t("location.deniedTitle")}
        </h2>
        <p className="text-body-lg text-muted">{t("location.deniedSteps")}</p>
        <Button size="xl" variant="secondary" onClick={() => window.location.reload()}>
          {t("location.reload")}
        </Button>
        <Button size="xl" disabled>
          {tRoot("driver.startTrip")}
        </Button>
      </Card>
    );
  }

  const reason = !deviceReady ? null : tooEarly && startableFrom ? t("startFrom", { time: formatTime(startableFrom, locale) }) : null;
  const errorText = error
    ? isApiError(error) && error.code === "TRIP_NOT_STARTABLE" && startableFrom
      ? t("startFrom", { time: formatTime(startableFrom, locale) })
      : tRoot(errorKey(error, (k) => tRoot.has(k)))
    : null;

  return (
    <div className="flex flex-col gap-2">
      {reason && <p className="text-body-lg text-muted">{reason}</p>}
      {errorText && (
        <p role="alert" className="flex items-center gap-2 text-body-lg text-status-danger">
          <ShieldAlert className="size-5 shrink-0" aria-hidden="true" />
          {errorText}
        </p>
      )}
      <Button size="xl" disabled={!deviceReady || tooEarly} loading={starting} onClick={() => void begin()}>
        {tRoot("driver.startTrip")}
      </Button>
    </div>
  );
}
