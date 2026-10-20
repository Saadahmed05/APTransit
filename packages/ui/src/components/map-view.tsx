"use client";
import { decodePolyline, STATUS_MAP } from "@aptransit/shared";
import { Bus, LocateFixed, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore, useState } from "react";
import { setWorkerUrl } from "maplibre-gl";
import Map, { Layer, Marker, Source, type MapRef } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { Button } from "./button";
import { cn } from "../cn";
import { StatusBadge } from "./status-badge";
import type { LiveBusDto } from "@aptransit/shared";
// The app serves the MapLibre worker from public/ (apps/web/scripts/copy-map-worker.mjs).
if (typeof window !== "undefined") setWorkerUrl("/maplibre-gl-worker.mjs");

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
  return [
    "--success-solid",
    "--neutral-solid",
    "--info-solid",
    "--map-line-width",
    "--primary",
    "--on-primary",
    "--surface-raised",
  ]
    .map((k) => css.getPropertyValue(k).trim())
    .join("|");
};

/** Map picker stops are one WebGL symbol layer: HTML markers for 100+ stops made panning janky on phones. */
const STOP_LAYER = "pick-stops";
const STOP_ICON = "pick-stop-bus";
/** Half of the 44 px tap target around a stop icon. */
const STOP_HIT_PX = 22;

/** The same look as the HTML stop marker: a primary circle, a surface ring and the lucide Bus glyph. */
function stopIconSvg(fill: string, ink: string, ring: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 28 28">` +
    `<circle cx="14" cy="14" r="13" fill="${fill}" stroke="${ring}" stroke-width="2"/>` +
    `<g transform="translate(6 6) scale(0.6667)" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/>` +
    `<path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/>` +
    `<circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></g></svg>`
  );
}
/** [minLng, minLat, maxLng, maxLat] of a state (GET /states, D-034). */
export type MapBounds = [number, number, number, number];

/** Used only until the state arrives from the API: the first state (Andhra Pradesh). */
export const DEFAULT_MAP_BOUNDS: MapBounds = [76.7, 12.6, 84.8, 19.95];

const centerOf = (b: MapBounds) => ({ lng: (b[0] + b[2]) / 2, lat: (b[1] + b[3]) / 2 });

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  /** D-042 map picker: from and to pins stand out, other stops are small dots. */
  tone?: "from" | "to" | "stop";
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
  /** The state to show when there is no center, route or markers. */
  bounds?: MapBounds;
  fitBounds?: boolean;
  mapStyle?: string;
  recenterLabel?: string;
  errorLabel?: string;
  retryLabel?: string;
  /** D-042: makes markers tappable (the map picker). Keep a keyboard list next to the map too: the map is hidden from screen readers. */
  onMarkerClick?: (id: string) => void;
  /** Draw a dashed line from the "from" marker to the "to" marker (map picker). */
  connect?: boolean;
  /** Fit the markers again whenever this value changes (map picker: a new A or B). */
  fitKey?: string;
  className?: string;
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
  bounds = DEFAULT_MAP_BOUNDS,
  fitBounds: shouldFit = true,
  mapStyle = "https://tiles.openfreemap.org/styles/liberty",
  recenterLabel,
  errorLabel = "Map failed to load",
  retryLabel = "Retry",
  onMarkerClick,
  connect = false,
  fitKey,
  className,
}: MapViewProps) {
  const ref = useRef<MapRef>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const colors = useSyncExternalStore(themeSubscribe, themeRead, () => "|||");
  const [doneColor, aheadColor, currentColor, spacing, primary, onPrimary, surfaceRaised] =
    colors.split("|");
  const unit = parseFloat(spacing ?? "") || 0;
  const [iconReady, setIconReady] = useState(false);
  const [hovering, setHovering] = useState(false);
  const stopMarkers = markers.filter((m) => m.tone === "stop");
  /** Draws the stop icon in the current theme colours; runs on load and again when the theme changes. */
  const loadStopIcon = () => {
    const map = ref.current?.getMap();
    if (!map || !primary || !onPrimary || !surfaceRaised) return;
    const img = new Image(56, 56);
    img.onload = () => {
      if (map.hasImage(STOP_ICON)) map.updateImage(STOP_ICON, img);
      else map.addImage(STOP_ICON, img, { pixelRatio: 2 });
      setIconReady(true);
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(stopIconSvg(primary, onPrimary, surfaceRaised))}`;
  };
  useEffect(() => {
    if (ref.current?.getMap().loaded()) loadStopIcon();
    // only a theme change should redraw the icon; the first draw happens in onLoad
  }, [colors]);
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
      : (coords[0] ?? [center?.lng ?? centerOf(bounds).lng, center?.lat ?? centerOf(bounds).lat]);
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
    } else if (connect) {
      // Map picker: stay on the starting view until A or B is set, then frame just those two
      const chosen = markers.filter((m) => m.tone === "from" || m.tone === "to");
      if (chosen.length === 1) {
        ref.current?.flyTo({ center: [chosen[0]!.lng, chosen[0]!.lat], zoom: 14, duration: 0 });
      } else if (chosen.length === 2) {
        ref.current?.fitBounds(
          [
            [Math.min(...chosen.map((m) => m.lng)), Math.min(...chosen.map((m) => m.lat))],
            [Math.max(...chosen.map((m) => m.lng)), Math.max(...chosen.map((m) => m.lat))],
          ],
          { padding: { top: 96, bottom: 64, left: 64, right: 64 }, duration: 0, maxZoom: 15 },
        );
      }
    } else if (markers.length === 1) {
      ref.current?.flyTo({ center: [markers[0]!.lng, markers[0]!.lat], zoom: 14, duration: 0 });
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
  // Map picker: a new A or B refits the view (camera moves work while tiles are still loading)
  useEffect(() => {
    if (fitKey !== undefined && ref.current) fit();
    // fit reads the latest markers; only a new fitKey should move the camera
  }, [fitKey]);
  const fromMarker = markers.find((m) => m.tone === "from");
  const toMarker = markers.find((m) => m.tone === "to");
  return (
    <section
      className={cn(
        "relative h-tracking-map overflow-hidden rounded-lg border border-default bg-surface",
        className,
      )}
    >
      <div className="h-full w-full" aria-hidden="true">
        <Map
          key={attempt}
          ref={ref}
          mapStyle={mapStyle}
          initialViewState={
            center
              ? { longitude: center.lng, latitude: center.lat, zoom: zoom ?? 12 }
              : { bounds }
          }
          attributionControl={{ compact: false }}
          keyboard={false}
          onLoad={() => {
            loadStopIcon();
            fit();
          }}
          onError={() => setFailed(true)}
          interactiveLayerIds={onMarkerClick ? [STOP_LAYER] : undefined}
          cursor={hovering ? "pointer" : undefined}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          onClick={(e) => {
            const map = ref.current;
            if (!onMarkerClick || !map?.getLayer(STOP_LAYER)) return;
            const { x, y } = e.point;
            const [hit] = map.queryRenderedFeatures(
              [
                [x - STOP_HIT_PX, y - STOP_HIT_PX],
                [x + STOP_HIT_PX, y + STOP_HIT_PX],
              ],
              { layers: [STOP_LAYER] },
            );
            const id: unknown = hit?.properties?.id;
            if (typeof id === "string") onMarkerClick(id);
          }}
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
          {connect && fromMarker && toMarker && aheadColor && (
            <Source
              id="connect"
              type="geojson"
              data={line([
                [fromMarker.lng, fromMarker.lat],
                [toMarker.lng, toMarker.lat],
              ])}
            >
              <Layer
                id="connect-line"
                type="line"
                paint={{ "line-color": aheadColor, "line-width": unit, "line-dasharray": [2, 2] }}
              />
            </Source>
          )}
          {iconReady && stopMarkers.length > 0 && (
            <Source
              id={STOP_LAYER}
              type="geojson"
              data={{
                type: "FeatureCollection",
                features: stopMarkers.map((m) => ({
                  type: "Feature",
                  properties: { id: m.id },
                  geometry: { type: "Point", coordinates: [m.lng, m.lat] },
                })),
              }}
            >
              <Layer
                id={STOP_LAYER}
                type="symbol"
                layout={{
                  "icon-image": STOP_ICON,
                  "icon-allow-overlap": true,
                  "icon-ignore-placement": true,
                }}
              />
            </Source>
          )}
          {markers
            .filter((m) => m.tone !== "stop")
            .map((m) => (
              <Marker
                key={m.id}
                longitude={m.lng}
                latitude={m.lat}
                anchor="bottom"
                onClick={
                  onMarkerClick
                    ? (e) => (e.originalEvent.stopPropagation(), onMarkerClick(m.id))
                    : undefined
                }
              >
                <span className="flex flex-col items-center gap-1">
                  {(m.tone === "from" || m.tone === "to") && (
                    <span className="max-w-40 truncate rounded-full bg-surface-raised px-2 py-0.5 text-caption font-medium text-fg shadow-md">
                      {m.label}
                    </span>
                  )}
                  <span
                    className={cn(
                      "relative flex size-9 items-center justify-center rounded-full border-2 border-surface-raised text-small font-bold shadow-md",
                      m.tone === "to"
                        ? "bg-status-danger-solid text-on-solid"
                        : "bg-primary text-on-primary",
                      onMarkerClick && "cursor-pointer",
                    )}
                    title={m.label}
                  >
                    <Bus className="size-5" aria-hidden="true" />
                    <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-surface-raised text-caption font-bold text-fg shadow-md">
                      {m.tone === "from" ? "A" : m.tone === "to" ? "B" : "*"}
                    </span>
                  </span>
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
  /** The state shown before any bus has a position. */
  bounds?: MapBounds;
}
export function OpsMap({ buses, mapStyle, labels, statusLabel, details, bounds = DEFAULT_MAP_BOUNDS }: OpsMapProps) {
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
        key={`${attempt}:${bounds.join(",")}`}
        initialViewState={buses[0] ? { latitude: buses[0].lat, longitude: buses[0].lng, zoom: 7 } : { bounds }}
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

const TONES = ["success", "info", "warning", "danger", "maintenance", "neutral"] as const;
/** Map paint cannot use classes: read the solid tone tokens (and the text on them) from CSS. */
const toneRead = () => {
  const css = getComputedStyle(document.documentElement);
  return [
    ...TONES.map((tone) => css.getPropertyValue(`--${tone}-solid`)),
    css.getPropertyValue("--on-solid"),
  ]
    .map((v) => v.trim())
    .join("|");
};

export interface GovMapDistrict {
  id: string;
  name: string;
  lat: number;
  lng: number;
  activeBuses: number;
  delayed: number;
  incidents: number;
  /** Tone of the delay level: success when nothing is late, warning or danger as it grows. */
  tone: "success" | "warning" | "danger";
  /** Accessible name, for example "Kurnool: 12 active buses, 3 delayed". */
  label: string;
}

export interface GovMapIncident {
  id: string;
  lat: number;
  lng: number;
  label: string;
}

export interface GovMapProps {
  districts: GovMapDistrict[];
  buses: LiveBusDto[];
  incidents: GovMapIncident[];
  mapStyle: string;
  /** Zooms to these districts (drill down); the whole state when not given. */
  focus?: { lat: number; lng: number; zoom: number };
  /** The state (or states) to show when there is no focus. */
  bounds?: MapBounds;
  onDistrict?: (id: string) => void;
  labels: { error: string; retry: string; legend: string };
}

/**
 * Government command center map (plan sec 35, docs/13 Gov map). District HQ markers are buttons
 * (size by active buses, tone by delay level, the delayed count as text). Buses are one clustered
 * GeoJSON source, so live positions change the source data without rebuilding markers. Incidents
 * get their own icon. Markers are pointer shortcuts; the district list next to the map is the keyboard
 * and screen reader route (pass onDistrict and render that list).
 */
export function GovMap({ districts, buses, incidents, mapStyle, focus, bounds = DEFAULT_MAP_BOUNDS, onDistrict, labels }: GovMapProps) {
  const [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  const colors = useSyncExternalStore(themeSubscribe, toneRead, () => "||||||").split("|");
  const onSolid = colors[TONES.length] ?? "";
  const color = Object.fromEntries(TONES.map((tone, i) => [tone, colors[i] ?? ""])) as Record<
    (typeof TONES)[number],
    string
  >;
  const most = Math.max(1, ...districts.map((d) => d.activeBuses));
  const busData = {
    type: "FeatureCollection" as const,
    features: buses.map((b) => ({
      type: "Feature" as const,
      properties: { tone: TONE_OF[b.displayStatus] ?? "neutral" },
      geometry: { type: "Point" as const, coordinates: [b.lng, b.lat] },
    })),
  };
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
    <section
      aria-label={labels.legend}
      className="relative h-tracking-map overflow-hidden rounded-lg border border-default bg-surface"
    >
      <Map
        key={`${attempt}:${bounds.join(",")}`}
        mapStyle={mapStyle}
        initialViewState={
          focus ? { latitude: focus.lat, longitude: focus.lng, zoom: focus.zoom } : { bounds }
        }
        attributionControl={{ compact: true }}
        onError={() => setFailed(true)}
      >
        {color.neutral && (
          <Source
            id="gov-buses"
            type="geojson"
            data={busData}
            cluster
            clusterRadius={40}
            clusterMaxZoom={11}
          >
            <Layer
              id="gov-bus-clusters"
              type="circle"
              filter={["has", "point_count"]}
              paint={{
                "circle-color": color.info,
                "circle-opacity": 0.85,
                "circle-radius": ["step", ["get", "point_count"], 14, 10, 18, 50, 24],
              }}
            />
            <Layer
              id="gov-bus-cluster-count"
              type="symbol"
              filter={["has", "point_count"]}
              layout={{ "text-field": ["get", "point_count_abbreviated"], "text-size": 12 }}
              paint={{ "text-color": onSolid }}
            />
            <Layer
              id="gov-bus-points"
              type="circle"
              filter={["!", ["has", "point_count"]]}
              paint={{
                "circle-radius": 6,
                "circle-stroke-width": 2,
                "circle-stroke-color": onSolid,
                "circle-color": [
                  "match",
                  ["get", "tone"],
                  "success",
                  color.success,
                  "warning",
                  color.warning,
                  "danger",
                  color.danger,
                  "maintenance",
                  color.maintenance,
                  "info",
                  color.info,
                  color.neutral,
                ],
              }}
            />
          </Source>
        )}
        {districts.map((d) => {
          const size =
            d.activeBuses / most > 0.66
              ? "size-14"
              : d.activeBuses / most > 0.33
                ? "size-12"
                : "size-11";
          return (
            <Marker key={d.id} latitude={d.lat} longitude={d.lng} anchor="center">
              {/* Pointer shortcut only: markers can overlap, so keyboard and screen reader users get the
                  same links from the district list next to the map (out of the tab order here). */}
              <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                title={d.label}
                onClick={() => onDistrict?.(d.id)}
                className={`flex ${size} items-center justify-center rounded-full border-2 border-surface text-small font-bold tabular-nums shadow-md ${TONE_SOLID[d.tone]}`}
              >
                {d.delayed}
              </button>
            </Marker>
          );
        })}
        {incidents.map((i) => (
          <Marker key={i.id} latitude={i.lat} longitude={i.lng} anchor="bottom">
            <span
              title={i.label}
              className="flex size-8 items-center justify-center rounded-md bg-status-danger-solid text-on-solid shadow-md"
            >
              <TriangleAlert className="size-5" aria-hidden="true" />
              <span className="sr-only">{i.label}</span>
            </span>
          </Marker>
        ))}
      </Map>
    </section>
  );
}

const TONE_SOLID = {
  success: "bg-status-success-solid text-on-solid",
  warning: "bg-status-warning-solid text-on-solid",
  danger: "bg-status-danger-solid text-on-solid",
} as const;

const TONE_OF: Partial<Record<LiveBusDto["displayStatus"], (typeof TONES)[number]>> =
  Object.fromEntries(
    Object.entries(STATUS_MAP).map(([key, value]) => [key, value.tone]),
  ) as Partial<Record<LiveBusDto["displayStatus"], (typeof TONES)[number]>>;

export default MapView;
