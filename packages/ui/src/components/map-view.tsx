"use client";
import { decodePolyline } from "@aptransit/shared";
import { Bus, LocateFixed } from "lucide-react";
import { useRef, useSyncExternalStore, useState } from "react";
import Map, { Layer, Marker, Source, type MapRef } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { Button } from "./button";
import { StatusBadge } from "./status-badge";
import type { LiveBusDto } from "@aptransit/shared";
const themeSubscribe = (notify: () => void) => {
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", notify);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", notify);
  };
};
const themeRead = () => {
  const css = getComputedStyle(document.documentElement);
  return ["--success-solid", "--neutral-solid", "--info-solid", "--map-line-width"]
    .map((k) => css.getPropertyValue(k).trim())
    .join("|");
};
export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
}

export interface MapViewProps {
  polyline?: string;
  progressPct?: number;
  position?: { lat: number; lng: number; headingDeg: number | null } | null;
  stops?: { stopId: string; lat: number; lng: number }[];
  nextStopId?: string | null;
  markers?: MapMarker[];
  center?: { lat: number; lng: number };
  zoom?: number;
  fitBounds?: boolean;
  mapStyle?: string;
  recenterLabel?: string;
  errorLabel?: string;
  retryLabel?: string;
}

export function MapView({
  polyline = "",
  progressPct = 0,
  position = null,
  stops = [],
  nextStopId = null,
  markers = [],
  center,
  zoom,
  fitBounds: shouldFit = true,
  mapStyle = "https://tiles.openfreemap.org/styles/liberty",
  recenterLabel,
  errorLabel = "Map failed to load",
  retryLabel = "Retry",
}: MapViewProps) {
  const ref = useRef<MapRef>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const colors = useSyncExternalStore(themeSubscribe, themeRead, () => "|||");
  const [doneColor, aheadColor, currentColor, spacing] = colors.split("|");
  const unit = parseFloat(spacing ?? "") || 0;
  const coords = polyline ? decodePolyline(polyline).map(([lat, lng]) => [lng, lat]) : [];
  const lengths = [0];
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]!,
      b = coords[i]!;
    lengths.push(
      lengths[i - 1]! +
        Math.hypot((b[0]! - a[0]!) * Math.cos((a[1]! * Math.PI) / 180), b[1]! - a[1]!),
    );
  }
  const target = ((lengths.at(-1) ?? 0) * progressPct) / 100;
  let cut = Math.max(
    1,
    lengths.findIndex((x) => x >= target),
  );
  if (progressPct >= 100) cut = coords.length - 1;
  const a = coords[Math.max(0, cut - 1)],
    b = coords[cut];
  const fraction =
    a && b
      ? Math.max(
          0,
          Math.min(1, (target - lengths[cut - 1]!) / (lengths[cut]! - lengths[cut - 1]! || 1)),
        )
      : 0;
  const split =
    a && b
      ? [a[0]! + (b[0]! - a[0]!) * fraction, a[1]! + (b[1]! - a[1]!) * fraction]
      : (coords[0] ?? [center?.lng ?? 78, center?.lat ?? 16]);
  const line = (points: number[][]) => ({
    type: "Feature" as const,
    properties: {},
    geometry: { type: "LineString" as const, coordinates: points },
  });
  const fit = () => {
    if (!shouldFit) return;
    if (coords.length > 1) {
      ref.current?.fitBounds(
        [
          [Math.min(...coords.map((c) => c[0]!)), Math.min(...coords.map((c) => c[1]!))],
          [Math.max(...coords.map((c) => c[0]!)), Math.max(...coords.map((c) => c[1]!))],
        ],
        { padding: unit * 8 || 32, duration: 0 },
      );
    } else if (markers.length > 1) {
      ref.current?.fitBounds(
        [
          [Math.min(...markers.map((m) => m.lng)), Math.min(...markers.map((m) => m.lat))],
          [Math.max(...markers.map((m) => m.lng)), Math.max(...markers.map((m) => m.lat))],
        ],
        { padding: 32, duration: 0 },
      );
    }
  };
  return (
    <section className="relative h-tracking-map overflow-hidden rounded-lg border border-default bg-surface">
      <div className="h-full w-full" aria-hidden="true">
        <Map
          key={attempt}
          ref={ref}
          mapStyle={mapStyle}
          initialViewState={
            center
              ? { longitude: center.lng, latitude: center.lat, zoom: zoom ?? 12 }
              : { bounds: [76.7, 12.6, 84.8, 19.95] }
          }
          attributionControl={{ compact: false }}
          keyboard={false}
          onLoad={fit}
          onError={() => setFailed(true)}
        >
          {doneColor && coords.length > 1 && (
            <>
              <Source id="done" type="geojson" data={line([...coords.slice(0, cut), split])}>
                <Layer
                  id="route-done"
                  type="line"
                  paint={{ "line-color": doneColor, "line-width": unit }}
                />
              </Source>
              <Source id="ahead" type="geojson" data={line([split, ...coords.slice(cut)])}>
                <Layer
                  id="route-ahead"
                  type="line"
                  paint={{ "line-color": aheadColor, "line-width": unit, "line-dasharray": [2, 2] }}
                />
              </Source>
              <Source
                id="stops"
                type="geojson"
                data={{
                  type: "FeatureCollection",
                  features: stops.map((s) => ({
                    type: "Feature",
                    properties: { next: s.stopId === nextStopId },
                    geometry: { type: "Point", coordinates: [s.lng, s.lat] },
                  })),
                }}
              >
                <Layer
                  id="stop-dots"
                  type="circle"
                  paint={{
                    "circle-radius": unit * 1.5,
                    "circle-color": ["case", ["get", "next"], currentColor!, aheadColor!],
                  }}
                />
              </Source>
            </>
          )}
          {markers.map((m) => (
            <Marker key={m.id} longitude={m.lng} latitude={m.lat} anchor="bottom">
              <span
                className="flex size-7 items-center justify-center rounded-full bg-primary text-on-primary text-xs font-bold shadow-md"
                title={m.label}
              >
                *
              </span>
            </Marker>
          ))}
          {position && (
            <Marker
              longitude={position.lng}
              latitude={position.lat}
              rotation={position.headingDeg ?? 0}
              rotationAlignment="map"
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-status-info-solid text-on-solid">
                <Bus className="size-6" />
              </span>
            </Marker>
          )}
        </Map>
      </div>
      {recenterLabel && (
        <Button
          variant="secondary"
          className="absolute right-3 top-3"
          onClick={() => {
            if (position)
              ref.current?.flyTo({ center: [position.lng, position.lat], zoom: 13, duration: 0 });
            else fit();
          }}
        >
          <LocateFixed className="size-5" aria-hidden="true" />
          {recenterLabel}
        </Button>
      )}
      {failed && (
        <div
          className="absolute bottom-3 left-3 right-3 rounded-md bg-surface-raised p-3 text-small"
          role="status"
        >
          {errorLabel}
          <Button
            variant="ghost"
            onClick={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
          >
            {retryLabel}
          </Button>
        </div>
      )}
    </section>
  );
}

export interface OpsMapProps {
  buses: LiveBusDto[];
  mapStyle: string;
  labels: {
    error: string;
    retry: string;
    route: string;
    driver: string;
    delay: string;
    close: string;
  };
  statusLabel: (status: LiveBusDto["displayStatus"]) => string;
  details: { tripId: string; route: string; driver: string | null }[];
}
export function OpsMap({ buses, mapStyle, labels, statusLabel, details }: OpsMapProps) {
  const [selected, setSelected] = useState<string | null>(null),
    [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  const bus = buses.find((b) => b.tripId === selected),
    detail = details.find((d) => d.tripId === selected);
  if (failed)
    return (
      <div
        className="flex h-tracking-map flex-col items-center justify-center gap-4 rounded-lg border border-default bg-surface p-4"
        role="alert"
      >
        <p>{labels.error}</p>
        <Button
          onClick={() => {
            setFailed(false);
            setAttempt((a) => a + 1);
          }}
        >
          {labels.retry}
        </Button>
      </div>
    );
  return (
    <section className="relative h-tracking-map overflow-hidden rounded-lg border border-default bg-surface">
      <Map
        key={attempt}
        initialViewState={{
          latitude: buses[0]?.lat ?? 15.8,
          longitude: buses[0]?.lng ?? 78.2,
          zoom: 7,
        }}
        mapStyle={mapStyle}
        onError={() => setFailed(true)}
        attributionControl={{ compact: true }}
      >
        {buses.map((b) => (
          <Marker key={b.tripId} latitude={b.lat} longitude={b.lng} anchor="bottom">
            <button
              type="button"
              className="min-h-11 rounded-md border border-default bg-surface p-2 shadow-md"
              aria-label={b.busRegNo}
              onClick={() => setSelected(b.tripId)}
            >
              <StatusBadge status={b.displayStatus} label={statusLabel(b.displayStatus)} solid />
            </button>
          </Marker>
        ))}
      </Map>
      {bus && (
        <div className="absolute bottom-4 left-4 right-4 rounded-lg border border-default bg-surface-raised p-4 shadow-md">
          <div className="flex items-center justify-between gap-2">
            <strong>{bus.busRegNo}</strong>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              {labels.close}
            </Button>
          </div>
          <p>
            {labels.route}: {detail?.route ?? bus.routeCode}
          </p>
          <p>
            {labels.driver}: {detail?.driver ?? labels.driver}
          </p>
          <StatusBadge status={bus.displayStatus} label={statusLabel(bus.displayStatus)} />
          <p>
            {labels.delay}: {bus.delayMinutes}
          </p>
        </div>
      )}
    </section>
  );
}

export default MapView;
