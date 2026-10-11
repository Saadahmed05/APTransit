"use client";
import type {
  GovMapDto} from "@aptransit/shared";
import {
  BusPositionEvent,
  deriveTripDisplayStatus,
  DistrictsResponse,
  type LiveBusDto,
  OpsDepotDto,
  PLATFORM_TIME_ZONE,
  type StateDto,
  StatesResponse,
} from "@aptransit/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { z } from "zod";
import { useAuth, useMe } from "../components/auth-provider";
import { api } from "./api";
import { liveSocket, subscribeRoom } from "./socket";

/** D-034: SUPER_ADMIN sees every state; state roles see the state on their role. */
const PLATFORM_ROLES = ["SUPER_ADMIN"];
const STATE_ROLES = ["TRANSPORT_OFFICER", "STATE_ADMIN"];

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

export interface GovScope {
  ready: boolean;
  /** SUPER_ADMIN: every state, with the state picker. */
  platform: boolean;
  /** States the caller sees whole (state roles). */
  stateIds: string[];
  /** Platform or at least one whole state: the command center, not a district. */
  statewide: boolean;
  districtId: string | null;
}

/** The caller's gov scope: every state, their states, or the district of their DISTRICT_OFFICER role. */
export function useGovScope(): GovScope {
  const me = useMe();
  const roles = me.data?.roles ?? [];
  const platform = roles.some((r) => PLATFORM_ROLES.includes(r.role));
  const stateIds = [...new Set(roles.flatMap((r) => (STATE_ROLES.includes(r.role) && r.stateId ? [r.stateId] : [])))];
  const districtId = roles.find((r) => r.role === "DISTRICT_OFFICER" && r.districtId)?.districtId ?? null;
  return { ready: Boolean(me.data), platform, stateIds, statewide: platform || stateIds.length > 0, districtId };
}

/** Active states with their map view (public, cached for the session). */
export function useStates() {
  const states = useQuery({
    queryKey: ["places", "states"],
    queryFn: ({ signal }) => api("/states", { schema: StatesResponse, signal, redirectOn401: false }),
    staleTime: Infinity,
  });
  return { ...states, states: states.data ?? [] };
}

/** One box around several states, so the platform view shows all of them. */
export function boundsOf(states: readonly StateDto[]): StateDto["bounds"] | undefined {
  if (!states.length) return undefined;
  return [
    Math.min(...states.map((s) => s.bounds[0])),
    Math.min(...states.map((s) => s.bounds[1])),
    Math.max(...states.map((s) => s.bounds[2])),
    Math.max(...states.map((s) => s.bounds[3])),
  ];
}

/**
 * Live updates for the gov screens (docs/13 Socket rooms): the state:{id} room of the picked state,
 * of each state in scope (every state for SUPER_ADMIN), or the officer's district room. KPI, trip
 * and incident events refresh the gov queries; bus positions move the buses on the cached map
 * without a refetch, so the map only updates its GeoJSON source.
 */
export function useGovLive(stateId?: string) {
  const scope = useGovScope(),
    { states } = useStates(),
    client = useQueryClient();
  const stateIds = stateId ? [stateId] : scope.platform ? states.map((s) => s.id) : scope.stateIds;
  const rooms = (stateIds.length ? stateIds.map((id) => `state:${id}`) : scope.districtId ? [`district:${scope.districtId}`] : []).join(" ");
  useEffect(() => {
    if (!scope.ready || !rooms) return;
    const offs = rooms.split(" ").map(subscribeRoom),
      socket = liveSocket();
    const off = () => offs.forEach((unsubscribe) => unsubscribe());
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
  }, [scope.ready, rooms, client]);
}

/** Every district with its state (public, cached for the session). */
export function useDistricts() {
  const districts = useQuery({
    queryKey: ["places", "districts"],
    queryFn: ({ signal }) => api("/districts", { schema: DistrictsResponse, signal, redirectOn401: false }),
    staleTime: Infinity,
  });
  return districts.data ?? [];
}

/** District and depot names for breadcrumbs (cached for the session). */
export function useGovPlaces() {
  const districts = useDistricts();
  const depots = useGovQuery("/ops/depots", z.array(OpsDepotDto));
  return { districts, depots: depots.data ?? [] };
}

/** Delay level of a district: none late, up to a quarter late, more than a quarter late. */
export function delayTone(activeBuses: number, delayed: number): "success" | "warning" | "danger" {
  if (delayed === 0) return "success";
  return delayed / Math.max(1, activeBuses) <= 0.25 ? "warning" : "danger";
}

/** Today in IST (YYYY-MM-DD), and a date some days before it. */
export function istDate(offsetDays = 0): string {
  const shifted = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: PLATFORM_TIME_ZONE }).format(shifted);
}
