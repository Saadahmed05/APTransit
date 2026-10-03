"use client";

import {
  type BusStandDto,
  type BusStandRouteDto,
  BusStandRoutesResponse,
  BusStandsResponse,
  type DistrictDto,
  DistrictsResponse,
} from "@aptransit/shared";
import {
  EmptyState,
  ErrorState,
  Skeleton,
} from "@aptransit/ui";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  ChevronRight,
  Home,
  MapPin,
  Navigation,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, errorKey } from "../../../lib/api";
import { queryKeys } from "../../../lib/query-keys";

export function TimetableClient({
  initialDistrictId,
  initialBusStandId,
}: {
  initialDistrictId?: string;
  initialBusStandId?: string;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  const districtId = searchParams.get("district") ?? initialDistrictId ?? "";
  const busStandId = searchParams.get("busStand") ?? initialBusStandId ?? "";

  // 1. Fetch all districts
  const districtsQuery = useQuery({
    queryKey: queryKeys.districts,
    queryFn: ({ signal }) =>
      api("/districts", {
        schema: DistrictsResponse,
        signal,
        redirectOn401: false,
      }),
  });

  // 2. Fetch bus stands in selected district
  const busStandsQuery = useQuery({
    queryKey: queryKeys.busStands(districtId),
    queryFn: ({ signal }) =>
      api(`/districts/${districtId}/bus-stands`, {
        schema: BusStandsResponse,
        signal,
        redirectOn401: false,
      }),
    enabled: Boolean(districtId),
  });

  // 3. Fetch routes leaving selected bus stand
  const routesQuery = useQuery({
    queryKey: queryKeys.routes(busStandId),
    queryFn: ({ signal }) =>
      api(`/bus-stands/${busStandId}/routes`, {
        schema: BusStandRoutesResponse,
        signal,
        redirectOn401: false,
      }),
    enabled: Boolean(busStandId),
  });

  // Find active district and bus stand objects
  const activeDistrict = districtsQuery.data?.find((d) => d.id === districtId);
  const activeBusStand = busStandsQuery.data?.find((bs) => bs.id === busStandId);

  const districtName = activeDistrict
    ? locale === "te"
      ? activeDistrict.nameTe
      : activeDistrict.nameEn
    : "";

  const busStandName = activeBusStand
    ? locale === "te"
      ? activeBusStand.nameTe
      : activeBusStand.nameEn
    : "";

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Breadcrumb Navigation */}
      <nav aria-label={t("common.breadcrumb")} className="flex items-center gap-2 text-small text-muted flex-wrap">
        <Link
          href="/"
          className="inline-flex items-center gap-1 hover:text-fg transition-colors"
        >
          <Home className="size-4" aria-hidden="true" />
          <span>{t("timetable.breadcrumbHome")}</span>
        </Link>

        <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden="true" />

        {districtId ? (
          <Link
            href="/timetable"
            className="hover:text-fg transition-colors"
          >
            {t("timetable.breadcrumbTimetable")}
          </Link>
        ) : (
          <span className="font-semibold text-fg">
            {t("timetable.breadcrumbTimetable")}
          </span>
        )}

        {districtId && (
          <>
            <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden="true" />
            {busStandId ? (
              <Link
                href={`/timetable?district=${districtId}`}
                className="hover:text-fg transition-colors"
              >
                {districtName || t("common.district")}
              </Link>
            ) : (
              <span className="font-semibold text-fg">
                {districtName || t("common.district")}
              </span>
            )}
          </>
        )}

        {busStandId && (
          <>
            <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden="true" />
            <span className="font-semibold text-fg">
              {busStandName || t("common.busStand")}
            </span>
          </>
        )}
      </nav>

      {/* LEVEL 1: Districts List */}
      {!districtId && (
        <section aria-labelledby="districts-heading" className="flex flex-col gap-4">
          <div>
            <h1 id="districts-heading" className="text-h1 text-fg font-bold">
              {t("timetable.districts")}
            </h1>
            <p className="mt-1 text-body text-muted">
              {t("timetable.selectDistrict")}
            </p>
          </div>

          {districtsQuery.isLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4" aria-busy="true">
              <span className="sr-only" role="status">
                {t("common.loading")}
              </span>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          )}

          {districtsQuery.isError && (
            <ErrorState
              title={t("timetable.errorTitle")}
              message={t(errorKey(districtsQuery.error, (k) => t.has(k)))}
              retryLabel={t("common.retry")}
              onRetry={() => districtsQuery.refetch()}
            />
          )}

          {districtsQuery.isSuccess && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {districtsQuery.data.map((district: DistrictDto) => {
                const name = locale === "te" ? district.nameTe : district.nameEn;
                return (
                  <button
                    key={district.id}
                    type="button"
                    onClick={() => router.push(`/timetable?district=${district.id}`)}
                    className="flex flex-col justify-between p-4 rounded-lg border border-default bg-surface-raised hover:border-strong hover:bg-surface text-left transition-colors cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="text-body-lg font-semibold text-fg">
                          {name}
                        </span>
                        <span className="text-caption text-subtle font-mono">
                          {district.code}
                        </span>
                      </div>
                      <span className="inline-flex size-8 items-center justify-center rounded-md bg-primary-soft text-primary">
                        <MapPin className="size-4" aria-hidden="true" />
                      </span>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-caption text-muted border-t border-default pt-2">
                      <span>
                        {t("timetable.busStandCount", { count: district.busStandCount })}
                      </span>
                      <ChevronRight className="size-4 text-subtle" aria-hidden="true" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* LEVEL 2: Bus Stands in District */}
      {districtId && !busStandId && (
        <section aria-labelledby="bus-stands-heading" className="flex flex-col gap-4">
          <div>
            <h1 id="bus-stands-heading" className="text-h1 text-fg font-bold">
              {t("timetable.busStandsIn", { district: districtName })}
            </h1>
          </div>

          {busStandsQuery.isLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4" aria-busy="true">
              <span className="sr-only" role="status">
                {t("common.loading")}
              </span>
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          )}

          {busStandsQuery.isError && (
            <ErrorState
              title={t("timetable.errorTitle")}
              message={t(errorKey(busStandsQuery.error, (k) => t.has(k)))}
              retryLabel={t("common.retry")}
              onRetry={() => busStandsQuery.refetch()}
            />
          )}

          {busStandsQuery.isSuccess && busStandsQuery.data.length === 0 && (
            <EmptyState
              icon={Building2}
              title={t("timetable.noBusStandsFound")}
            />
          )}

          {busStandsQuery.isSuccess && busStandsQuery.data.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {busStandsQuery.data.map((bs: BusStandDto) => {
                const name = locale === "te" ? bs.nameTe : bs.nameEn;
                return (
                  <button
                    key={bs.id}
                    type="button"
                    onClick={() =>
                      router.push(`/timetable?district=${districtId}&busStand=${bs.id}`)
                    }
                    className="flex flex-col justify-between p-4 rounded-lg border border-default bg-surface-raised hover:border-strong hover:bg-surface text-left transition-colors cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-body-lg font-semibold text-fg">
                        {name}
                      </span>
                      <span className="inline-flex size-8 items-center justify-center rounded-md bg-primary-soft text-primary">
                        <Building2 className="size-4" aria-hidden="true" />
                      </span>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-caption text-muted border-t border-default pt-2">
                      <span>
                        {t("timetable.routeCount", { count: bs.routeCount })}
                      </span>
                      <ChevronRight className="size-4 text-subtle" aria-hidden="true" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* LEVEL 3: Routes from Bus Stand */}
      {districtId && busStandId && (
        <section aria-labelledby="routes-heading" className="flex flex-col gap-4">
          <div>
            <h1 id="routes-heading" className="text-h1 text-fg font-bold">
              {t("timetable.routesFrom", { busStand: busStandName })}
            </h1>
          </div>

          {routesQuery.isLoading && (
            <div className="flex flex-col gap-3" aria-busy="true">
              <span className="sr-only" role="status">
                {t("common.loading")}
              </span>
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full rounded-lg" />
              ))}
            </div>
          )}

          {routesQuery.isError && (
            <ErrorState
              title={t("timetable.errorTitle")}
              message={t(errorKey(routesQuery.error, (k) => t.has(k)))}
              retryLabel={t("common.retry")}
              onRetry={() => routesQuery.refetch()}
            />
          )}

          {routesQuery.isSuccess && routesQuery.data.length === 0 && (
            <EmptyState
              icon={Navigation}
              title={t("timetable.noRoutesFound")}
            />
          )}

          {routesQuery.isSuccess && routesQuery.data.length > 0 && (
            <div className="flex flex-col gap-3">
              {routesQuery.data.map((r: BusStandRouteDto) => {
                const name = locale === "te" ? r.nameTe : r.nameEn;
                const dest = locale === "te" ? r.destination.nameTe : r.destination.nameEn;

                return (
                  <Link
                    key={r.id}
                    href={`/timetable/route/${r.id}`}
                    className="flex flex-col gap-3 p-4 rounded-lg border border-default bg-surface-raised hover:border-strong hover:bg-surface transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-body-lg font-semibold text-fg">
                            {name}
                          </span>
                          <span className="text-caption text-subtle font-mono">
                            ({r.code})
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-small text-muted">
                          <span>{t("common.to")}:</span>
                          <span className="font-medium text-fg">{dest}</span>
                        </div>
                      </div>

                      <span className="inline-flex items-center gap-1 text-small font-medium text-primary shrink-0">
                        <span>{t("timetable.viewTimetable")}</span>
                        <ArrowRight className="size-4" aria-hidden="true" />
                      </span>
                    </div>

                    {r.serviceTypes.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap border-t border-default pt-2.5">
                        {r.serviceTypes.map((st) => {
                          const stKey = `serviceType.${st}`;
                          const stLabel = t.has(stKey) ? t(stKey) : st;
                          return (
                            <span
                              key={st}
                              className="px-2 py-0.5 rounded-sm text-caption font-medium bg-surface text-muted border border-default"
                            >
                              {stLabel}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
