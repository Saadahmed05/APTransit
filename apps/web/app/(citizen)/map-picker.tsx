"use client";

import { type NearbyPlaceDto, PlacesNearbyResponse, type PlaceDto } from "@aptransit/shared";
import { Button, Skeleton } from "@aptransit/ui";
import { useQuery } from "@tanstack/react-query";
import { LocateFixed } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { type ReactNode, useState } from "react";
import { api } from "../../lib/api";

const MapView = dynamic(() => import("@aptransit/ui/map-view"), {
  ssr: false,
  loading: () => <Skeleton className="h-home-map w-full" />,
});

/** Kurnool city: the first view lists the nearest stops, so its malls and colleges show up. */
const START_CENTRE = { lat: 15.8281, lng: 78.0373 };

/**
 * D-042, D-046 map picker (Rapido style): a Pickup and a Drop row sit above the map, one of them is
 * active, and tapping a stop dot sets the active one and moves on to the other. A dashed line joins
 * A and B. "Use my location" picks the nearest stop as Pickup. The map is hidden from screen
 * readers, so the same stops are listed below as buttons.
 */
export function MapPicker({
  from,
  to,
  onPick,
  sheet,
}: {
  from: PlaceDto | null;
  to: PlaceDto | null;
  onPick: (field: "from" | "to", place: PlaceDto) => void;
  /** The search sheet: it overlaps the lower edge of the map and keeps the stop list below it. */
  sheet?: ReactNode;
}) {
  const t = useTranslations("home.map");
  const locale = useLocale();
  const [centre, setCentre] = useState<{ lat: number; lng: number } | null>(null);
  const [active, setActive] = useState<"from" | "to">("from");
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const point = centre ?? START_CENTRE;
  const stops = useQuery({
    queryKey: ["places", "nearby", point.lat, point.lng, centre ? 30 : 200],
    queryFn: () =>
      api("/places/nearby", {
        query: { lat: point.lat, lng: point.lng, limit: centre ? 30 : 200 },
        schema: PlacesNearbyResponse,
        redirectOn401: false,
      }),
    staleTime: 5 * 60_000,
  });
  const name = (p: PlaceDto) => (locale === "te" ? p.nameTe : p.nameEn);

  /** Set the active field, then hand over to the other one that is still empty. */
  const choose = (place: NearbyPlaceDto, field: "from" | "to" = active) => {
    onPick(field, place);
    const other = field === "from" ? "to" : "from";
    setActive(other === "to" ? (to ? field : "to") : from ? field : "from");
  };

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
          if (nearest) choose(nearest, "from");
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

  const districtOf = (s: NearbyPlaceDto) => (locale === "te" ? s.districtNameTe : s.districtNameEn);
  const homeDistrict = list[0] ? districtOf(list[0]) : null;
  const homeStops = list.filter((s) => districtOf(s) === homeDistrict);
  const otherStops = list.filter((s) => districtOf(s) !== homeDistrict);

  const stopRows = (rows: NearbyPlaceDto[]) => (
    <ul className="flex flex-col divide-y divide-hairline">
      {rows.map((s) => (
        <li key={s.id} className="flex items-center justify-between gap-2 px-4 py-2">
          <span className="min-w-0 text-body text-fg">
            {name(s)}
            <span className="block text-small text-muted">
              {centre || districtOf(s) === homeDistrict ? t("distance", { km: s.distanceKm }) : districtOf(s)}
            </span>
          </span>
          <span className="flex shrink-0 gap-1">
            <Button variant="ghost" aria-label={t("fromStop", { stop: name(s) })} onClick={() => choose(s, "from")}>
              {t("from")}
            </Button>
            <Button variant="ghost" aria-label={t("toStop", { stop: name(s) })} onClick={() => choose(s, "to")}>
              {t("to")}
            </Button>
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <section aria-labelledby="map-picker-title" className="flex flex-col">
      <h2 id="map-picker-title" className="sr-only">
        {t("title")}
      </h2>

      {/* The map fills the first screen; tapping a bus stop fills From, then To. The search sheet holds both fields */}
      <div className="relative">
        {stops.isError ? (
          <div className="flex h-home-map flex-col items-start justify-end gap-2 rounded-lg border border-default bg-surface-raised p-4">
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
            center={centre ?? START_CENTRE}
            zoom={centre ? 13 : 12.5}
            connect
            fitBounds
            fitKey={`${from?.id ?? ""}|${to?.id ?? ""}`}
            onMarkerClick={(id) => {
              const stop = list.find((s) => s.id === id);
              if (stop) choose(stop);
            }}
            errorLabel={t("error")}
            retryLabel={t("retry")}
          />
        )}

        <div className="absolute bottom-10 right-3">
          <Button
            variant="secondary"
            className="shadow-md"
            loading={locating}
            onClick={locate}
            leftIcon={<LocateFixed className="size-4" aria-hidden="true" />}
          >
            {t("useMyLocation")}
          </Button>
        </div>
      </div>
      {locateError ? (
        <p role="alert" className="px-gutter pt-2 text-small text-status-danger">
          {locateError}
        </p>
      ) : null}

      {sheet}

      {/* Always open: the city's own stops (Kurnool on first load). Other cities go live later; search still finds them */}
      <section aria-labelledby="stop-list-title" className="mt-3 rounded-lg border border-default bg-surface-raised">
        <h3 id="stop-list-title" className="p-4 pb-2 text-body font-medium text-fg">
          {homeDistrict ? t("stopsIn", { place: homeDistrict }) : t("listTitle")}
        </h3>
        {stops.isPending ? (
          <div className="flex flex-col gap-2 p-4 pt-0">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        ) : list.length === 0 ? (
          <p className="p-4 pt-0 text-body text-muted">{t("empty")}</p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {stopRows(homeStops)}
            {otherStops.length > 0 && (
              <p className="border-t border-default p-4 text-small text-muted">{t("comingSoon")}</p>
            )}
          </div>
        )}
      </section>
    </section>
  );
}
