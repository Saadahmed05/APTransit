"use client";
import { useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { OpsDepotDto, OpsBusTypeDto, BusPositionEvent, deriveTripDisplayStatus, type LiveBusDto } from "@aptransit/shared";
import { api } from "./api";
import { boundsOf, useDistricts, useStates } from "./gov";
import { liveSocket, subscribeRoom } from "./socket";
import { useAuth, useMe } from "../components/auth-provider";
export function useOpsFilters() {
  const params = useSearchParams(),
    router = useRouter(),
    path = usePathname();
  const set = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params);
      if (value) next.set(key, value);
      else next.delete(key);
      router.replace(path + (next.size ? "?" + next.toString() : ""), { scroll: false });
    },
    [params, path, router],
  );
  return { depotId: params.get("depot") ?? undefined, params, set };
}
export function useOpsQuery<T>(
  path: string,
  schema: z.ZodType<T>,
  query: Record<string, string | undefined> = {},
) {
  const auth = useAuth();
  return useQuery({
    enabled: auth.status === "authenticated",
    queryKey: ["ops", path, query],
    queryFn: ({ signal }) => api(path, { schema, query, signal }),
    refetchInterval: 15_000,
  });
}
export function useOpsDepots() {
  return useOpsQuery("/ops/depots", z.array(OpsDepotDto));
}
/** The map box of the states the caller's depots are in (D-034); undefined until loaded. */
export function useOpsBounds() {
  const depots = useOpsDepots(),
    districts = useDistricts(),
    { states } = useStates();
  const districtIds = new Set((depots.data ?? []).map((d) => d.districtId));
  const stateIds = new Set(districts.filter((d) => districtIds.has(d.id)).map((d) => d.stateId));
  return boundsOf(states.filter((s) => stateIds.has(s.id)));
}
export function useOpsBusTypes() {
  return useOpsQuery("/ops/bus-types", z.array(OpsBusTypeDto));
}
/** The live rooms of the ops screens (D-034): one depot, every state, the caller's states, or their districts and depots. */
function opsRooms(roles: { role: string; depotId?: string | null; districtId?: string | null; stateId?: string | null }[], stateIds: string[], depotId?: string): string[] {
  if (depotId) return ["depot:" + depotId];
  if (roles.some((r) => r.role === "SUPER_ADMIN")) return stateIds.map((id) => "state:" + id);
  return [
    ...new Set(
      roles.flatMap((r) =>
        ["STATE_ADMIN", "TRANSPORT_OFFICER"].includes(r.role)
          ? r.stateId
            ? ["state:" + r.stateId]
            : []
          : r.districtId
            ? ["district:" + r.districtId]
            : r.depotId
              ? ["depot:" + r.depotId]
              : [],
      ),
    ),
  ];
}

export function useOpsLive(depotId?: string) {
  const me = useMe(),
    { states } = useStates(),
    client = useQueryClient();
  const rooms = me.data ? opsRooms(me.data.roles, states.map((s) => s.id), depotId).join(" ") : "";
  useEffect(() => {
    if (!rooms) return;
    const off = rooms.split(" ").map(subscribeRoom),
      socket = liveSocket(),
      events = [
        "kpi:update",
        "trip:status",
        "incident:new",
        "incident:update",
        "connect",
      ];
    const update = () => {
      void client.invalidateQueries({ queryKey: ["ops"] });
    };
    const position = (payload: unknown) => {
      const parsed = BusPositionEvent.safeParse(payload); if(!parsed.success)return;
      const p=parsed.data;
      client.setQueriesData<LiveBusDto[]>({queryKey:["ops","/tracking/live"]}, rows => rows?.map(b => b.tripId===p.tripId ? {...b,...p,displayStatus:["RUNNING","DELAYED"].includes(b.displayStatus)?deriveTripDisplayStatus({status:"RUNNING",hasOpenIncident:false,delayMinutes:p.delayMinutes}):b.displayStatus} : b));
    };
    socket.on("bus:position",position);
    events.forEach((event) => socket.on(event, update));
    return () => {
      socket.off("bus:position",position);
      off.forEach((fn) => fn());
      events.forEach((event) => socket.off(event, update));
    };
  }, [rooms, client]);
}
