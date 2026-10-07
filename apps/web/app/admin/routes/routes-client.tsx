"use client";

import { useState } from "react";
import { z } from "zod";
import { AdminRouteDto } from "@aptransit/shared";
import {
  DataTable,
  Input,
  Skeleton,
} from "@aptransit/ui";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useAdminQuery } from "../../../lib/admin";
import { OpsEmpty, OpsError } from "../../ops/ops-common";
import { Edit2, Route } from "lucide-react";

export default function RoutesClient() {
  const t = useTranslations("adminApp");
  const [search, setSearch] = useState("");

  const {
    data: routes,
    isLoading,
    error,
    refetch,
  } = useAdminQuery("/admin/routes", z.array(AdminRouteDto), search ? { q: search } : {});

  const columns = [
    {
      id: "code",
      header: t("code"),
      cell: (r: AdminRouteDto) => (
        <Link href={`/admin/routes/${r.id}`} className="font-mono font-semibold text-primary hover:underline">
          {r.code}
        </Link>
      ),
      sortValue: (r: AdminRouteDto) => r.code,
    },
    {
      id: "nameEn",
      header: t("nameEn"),
      cell: (r: AdminRouteDto) => r.nameEn,
      sortValue: (r: AdminRouteDto) => r.nameEn,
    },
    {
      id: "nameTe",
      header: t("nameTe"),
      cell: (r: AdminRouteDto) => r.nameTe,
      sortValue: (r: AdminRouteDto) => r.nameTe,
    },
    {
      id: "distance",
      header: t("distanceKm"),
      cell: (r: AdminRouteDto) => `${r.distanceKm} km`,
      sortValue: (r: AdminRouteDto) => r.distanceKm,
    },
    {
      id: "stops",
      header: t("stopsCount"),
      cell: (r: AdminRouteDto) => r.stops.length,
      sortValue: (r: AdminRouteDto) => r.stops.length,
    },
    {
      id: "actions",
      header: t("actions"),
      cell: (r: AdminRouteDto) => (
        <Link
          href={`/admin/routes/${r.id}`}
          className="inline-flex min-h-11 items-center gap-1 rounded-md px-3 text-primary hover:bg-surface-raised"
        >
          <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t("editStops")}</span>
        </Link>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Route className="h-6 w-6 text-primary" />
            <h1 className="text-h1 font-bold">{t("routesTitle")}</h1>
          </div>
          <p className="text-muted">{t("routesDesc")}</p>
        </div>
      </div>

      <div className="w-full max-w-sm">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchRoutesPlaceholder")}
        />
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : error ? (
        <OpsError error={error} retry={refetch} />
      ) : (
        <DataTable
          label={t("routes")}
          columns={columns}
          rows={routes || []}
          rowKey={(r) => r.id}
          empty={<OpsEmpty />}
        />
      )}
    </div>
  );
}
