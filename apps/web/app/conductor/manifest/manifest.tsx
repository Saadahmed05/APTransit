"use client";
import { ConductorManifestDto } from "@aptransit/shared";
import { Button, EmptyState, ErrorState, Skeleton, TicketStatusBadge } from "@aptransit/ui";
import { ScanLine } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useConductorToday } from "../../../lib/conductor-today";
import { api, errorKey } from "../../../lib/api";
export function ConductorManifest() {
  const t = useTranslations("conductorApp"),
    root = useTranslations(),
    today = useConductorToday(),
    tripId = today.data?.trip?.id;
  const manifest = useQuery({
    queryKey: ["conductor", "manifest", tripId],
    enabled: Boolean(tripId),
    queryFn: ({ signal }) =>
      api("/conductor/trips/" + tripId + "/manifest", { schema: ConductorManifestDto, signal }),
  });
  if (today.isLoading || (tripId && manifest.isLoading))
    return (
      <div aria-busy="true">
        <h1 className="sr-only">{t("manifest")}</h1>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (today.isError || manifest.isError)
    return (
      <ErrorState
        headingLevel="h1"
        title={t("error")}
        message={root(errorKey(today.error ?? manifest.error, (k) => root.has(k)))}
        retryLabel={root("common.retry")}
        onRetry={() => {
          void today.refetch();
          void manifest.refetch();
        }}
      />
    );
  if (!tripId || !manifest.data?.seats.length)
    return (
      <EmptyState
        icon={ScanLine}
        headingLevel="h1"
        title={t("manifestEmpty")}
        hint={t("emptyHelper")}
      />
    );
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-h1">{t("manifest")}</h1>
      <ul className="divide-y divide-default rounded-lg border border-default">
        {manifest.data.seats.map((s, i) => (
          <li
            key={(s.seatNo ?? "standing") + i}
            className="flex min-h-16 items-center justify-between gap-3 p-4"
          >
            <span>{s.seatNo ? t("seat", { seat: s.seatNo }) : t("unreserved")}</span>
            <TicketStatusBadge
              status={s.state === "CHECKED" ? "SCANNED" : "BOOKED"}
              label={t(s.state === "CHECKED" ? "checked" : "pending")}
            />
          </li>
        ))}
      </ul>
      <Button size="xl" asChild variant="secondary">
        <Link href="/conductor">{t("back")}</Link>
      </Button>
    </div>
  );
}
