"use client";

import { type NearbyPlaceDto, PlacesNearbyResponse, type PlaceDto } from "@aptransit/shared";
import { Button, Skeleton } from "@aptransit/ui";
import { useQuery } from "@tanstack/react-query";
import { LocateFixed, MapPin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useState } from "react";
import { api } from "../../lib/api";

const MapView = dynamic(() => import("@aptransit/ui/map-view"), {
  ssr: false,
  loading: () => <Skeleton className="h-home-map w-full" />,
});

/** Centre of Andhra Pradesh: with a large limit the first view shows every stop in the state. */
const AP_CENTRE = { lat: 15.9, lng: 79.7 };

/**
 * D-042 map picker (Google Maps style): every stop is a dot on the map. Tap one, then choose
 * "Set as from" or "Set as to". "Use my location" picks the nearest stop as From. The map is hidden
 * from screen readers, so the same stops are listed below as buttons.
 */
export function MapPicker({
  from,
  to,
  onPick,
}: {
  from: PlaceDto | null;
  to: PlaceDto | null;
  onPick: (field: "from" | "to", place: PlaceDto) => void;
}) {
  const t = useTranslations("home.map");
  const locale = useLocale();
  const [centre, setCentre] = useState<{ lat: number; lng: number } | null>(null);
  const [selected, setSelected] = useState<NearbyPlaceDto | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const point = centre ?? AP_CENTRE;
  const stops = useQuery({
    queryKey: ["places", "nearby", point.lat, point.lng, centre ? 20 : 50],
    queryFn: () =>
      api("/places/nearby", {
        query: { lat: point.lat, lng: point.lng, limit: centre ? 20 : 50 },
        schema: PlacesNearbyResponse,
        redirectOn401: false,
      }),
    staleTime: 5 * 60_000,
  });
  const name = (p: PlaceDto) => (locale === "te" ? p.nameTe : p.nameEn);

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setLocateError(t("noLocation"));
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const here = { lat: coords.latitude, lng: coords.longitude };
        setCentre(here);
        try {
          const [nearest] = await api("/places/nearby", {
            query: { ...here, limit: 1 },
            schema: PlacesNearbyResponse,
            redirectOn401: false,
          });
          if (nearest) onPick("from", nearest);
        } catch {
          setLocateError(t("noLocation"));
        }
        setLocating(false);
      },
      () => {
        setLocating(false);
        setLocateError(t("noLocation"));
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const list = stops.data ?? [];
  const markers = list.map((s) => ({
    id: s.id,
    lat: s.lat,
    lng: s.lng,
    label: name(s),
    tone:
      s.id === from?.id ? ("from" as const) : s.id === to?.id ? ("to" as const) : ("stop" as const),
  }));

  return (
    <section aria-labelledby="map-picker-title" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="map-picker-title" className="text-h3 text-fg">
          {t("title")}
        </h2>
        <Button
          variant="secondary"

          loading={locating}
          onClick={locate}
          leftIcon={<LocateFixed className="size-4" aria-hidden="true" />}
        >
          {t("useMyLocation")}
        </Button>
      </div>
      {locateError ? (
        <p role="alert" className="text-small text-status-danger">
          {locateError}
        </p>
      ) : null}

      {stops.isError ? (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-default bg-surface-raised p-4">
          <p className="text-body text-fg">{t("error")}</p>
          <Button variant="secondary" onClick={() => void stops.refetch()}>
            {t("retry")}
          </Button>
        </div>
      ) : (
        <MapView
          className="h-home-map"
          mapStyle={
            process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty"
          }
          markers={markers}
          fitBounds
          onMarkerClick={(id) => setSelected(list.find((s) => s.id === id) ?? null)}
          errorLabel={t("error")}
          retryLabel={t("retry")}
        />
      )}

      {selected ? (
        <div
          role="group"
          aria-label={name(selected)}
          className="animate-enter flex flex-col gap-3 rounded-lg border border-default bg-surface-raised p-4 shadow-md"
        >
          <p className="flex items-center gap-2 text-body font-medium text-fg">
            <MapPin className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0">{name(selected)}</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              onClick={() => (onPick("from", selected), setSelected(null))}
            >
              {t("setFrom")}
            </Button>
            <Button onClick={() => (onPick("to", selected), setSelected(null))}>
              {t("setTo")}
            </Button>
          </div>
        </div>
      ) : null}

      <details className="rounded-lg border border-default bg-surface-raised">
        <summary className="cursor-pointer list-none p-4 text-body font-medium text-fg">
          {t("listTitle")}
        </summary>
        {stops.isPending ? (
          <div className="flex flex-col gap-2 p-4 pt-0">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        ) : list.length === 0 ? (
          <p className="p-4 pt-0 text-body text-muted">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-hairline">
            {list.slice(0, 20).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 px-4 py-2">
                <span className="min-w-0 text-body text-fg">
                  {name(s)}
                  <span className="block text-small text-muted">
                    {centre
                      ? t("distance", { km: s.distanceKm })
                      : locale === "te"
                        ? s.districtNameTe
                        : s.districtNameEn}
                  </span>
                </span>
                <span className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    aria-label={t("fromStop", { stop: name(s) })}
                    onClick={() => onPick("from", s)}
                  >
                    {t("from")}
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={t("toStop", { stop: name(s) })}
                    onClick={() => onPick("to", s)}
                  >
                    {t("to")}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
}
