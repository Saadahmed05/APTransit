"use client";
import type {
  GovMapDto} from "@aptransit/shared";
import {
  BusPositionEvent,
  deriveTripDisplayStatus,
  DistrictsResponse,
  type LiveBusDto,
  OpsDepotDto,
} from "@aptransit/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { z } from "zod";
import { useAuth, useMe } from "../components/auth-provider";
import { api } from "./api";
import { liveSocket, subscribeRoom } from "./socket";

const STATEWIDE = ["TRANSPORT_OFFICER", "STATE_ADMIN", "SUPER_ADMIN"];

/** Government reads: refreshed every 15 s as a fallback; socket events refresh them sooner. */
export function useGovQuery<T>(path: string, schema: z.ZodType<T>, query: Record<string, string | undefined> = {}, enabled = true) {
  const auth = useAuth();
  return useQuery({
    enabled: enabled && auth.status === "authenticated",
    queryKey: ["gov", path, query],
    queryFn: ({ signal }) => api(path, { schema, query, signal }),
    refetchInterval: 15_000,
  });
}

/** The caller's gov scope: statewide, or the district of their DISTRICT_OFFICER role. */
export function useGovScope(): { ready: boolean; statewide: boolean; districtId: string | null } {
  const me = useMe();
  const roles = me.data?.roles ?? [];
  const statewide = roles.some((r) => STATEWIDE.includes(r.role));
  const districtId = roles.find((r) => r.role === "DISTRICT_OFFICER" && r.districtId)?.districtId ?? null;
  return { ready: Boolean(me.data), statewide, districtId };
}

/**
 * Live updates for the gov screens (docs/13 Socket rooms): the state room, or the officer's
 * district room. KPI, trip and incident events refresh the gov queries; bus positions move the
 * buses on the cached map without a refetch, so the map only updates its GeoJSON source.
 */
export function useGovLive() {
  const scope = useGovScope(),
    client = useQueryClient();
  useEffect(() => {
    if (!scope.ready) return;
    const room = scope.statewide ? "state" : scope.districtId ? `district:${scope.districtId}` : null;
    if (!room) return;
    const off = subscribeRoom(room),
      socket = liveSocket();
    const refresh = () => void client.invalidateQueries({ queryKey: ["gov"] });
    const position = (payload: unknown) => {
      const parsed = BusPositionEvent.safeParse(payload);
      if (!parsed.success) return;
      const p = parsed.data;
      client.setQueriesData<GovMapDto>({ queryKey: ["gov", "/gov/map"] }, (map) =>
        map
          ? {
              ...map,
              buses: map.buses.map((b): LiveBusDto =>
                b.tripId === p.tripId
                  ? {
                      ...b,
                      lat: p.lat,
                      lng: p.lng,
                      delayMinutes: p.delayMinutes,
                      displayStatus: ["RUNNING", "DELAYED"].includes(b.displayStatus)
                        ? deriveTripDisplayStatus({ status: "RUNNING", hasOpenIncident: false, delayMinutes: p.delayMinutes })
                        : b.displayStatus,
                    }
                  : b,
              ),
            }
          : map,
      );
    };
    const events = ["kpi:update", "trip:status", "incident:new", "incident:update", "connect"];
    events.forEach((e) => socket.on(e, refresh));
    socket.on("bus:position", position);
    return () => {
      off();
      events.forEach((e) => socket.off(e, refresh));
      socket.off("bus:position", position);
    };
  }, [scope.ready, scope.statewide, scope.districtId, client]);
}

/** District and depot names for breadcrumbs (cached for the session). */
export function useGovPlaces() {
  const districts = useQuery({
    queryKey: ["places", "districts"],
    queryFn: ({ signal }) => api("/network/districts", { schema: DistrictsResponse, signal, redirectOn401: false }),
    staleTime: Infinity,
  });
  const depots = useGovQuery("/ops/depots", z.array(OpsDepotDto));
  return { districts: districts.data ?? [], depots: depots.data ?? [] };
}

/** Delay level of a district: none late, up to a quarter late, more than a quarter late. */
export function delayTone(activeBuses: number, delayed: number): "success" | "warning" | "danger" {
  if (delayed === 0) return "success";
  return delayed / Math.max(1, activeBuses) <= 0.25 ? "warning" : "danger";
}

/** Today in IST (YYYY-MM-DD), and a date some days before it. */
export function istDate(offsetDays = 0): string {
  const shifted = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(shifted);
}
