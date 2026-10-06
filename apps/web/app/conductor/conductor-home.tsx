"use client";
import { formatTime } from "@aptransit/shared";
import { Button, EmptyState, ErrorState, Skeleton } from "@aptransit/ui";
import { ScanLine } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { ConductorCounts } from "../../components/conductor-counts";
import { useConductorToday } from "../../lib/conductor-today";
import { errorKey } from "../../lib/api";
export function ConductorHome() {
  const t = useTranslations("conductorApp"),
    root = useTranslations(),
    locale = useLocale(),
    query = useConductorToday();
  if (query.isLoading)
    return (
      <div aria-busy="true">
        <h1 className="sr-only">{t("today")}</h1>
        <Skeleton className="h-32 w-full" />
      </div>
    );
  if (query.isError)
    return (
      <ErrorState
        headingLevel="h1"
        title={t("error")}
        message={root(errorKey(query.error, (k) => root.has(k)))}
        retryLabel={root("common.retry")}
        onRetry={() => void query.refetch()}
      />
    );
  if (!query.data?.trip)
    return (
      <EmptyState icon={ScanLine} headingLevel="h1" title={t("empty")} hint={t("emptyHelper")} />
    );
  const { trip, route } = query.data;
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1">{t("today")}</h1>
      <p className="text-h2">
        {route ? (locale === "te" ? route.nameTe : route.nameEn) : trip.code}
      </p>
      <p>{t("departure", { time: formatTime(trip.scheduledDepartureAt, locale) })}</p>
      <ConductorCounts large />
      {trip.status === "RUNNING" ? (
        <Button size="xl" className="h-16 min-h-16" asChild>
          <Link href="/conductor/scan">
            <ScanLine className="size-6" aria-hidden="true" />
            {t("scan")}
          </Link>
        </Button>
      ) : (
        <Button size="xl" className="h-16 min-h-16" disabled>
          {t("scan")}
        </Button>
      )}
      {trip.status !== "RUNNING" && <p>{t("notRunning")}</p>}
      <Button size="xl" variant="secondary" asChild>
        <Link href="/conductor/manifest">{t("manifest")}</Link>
      </Button>
    </div>
  );
}
