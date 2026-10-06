"use client";
import { useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { OpsDepotDto, OpsBusTypeDto, BusPositionEvent, deriveTripDisplayStatus, type LiveBusDto } from "@aptransit/shared";
import { api } from "./api";
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
export function useOpsBusTypes() {
  return useOpsQuery("/ops/bus-types", z.array(OpsBusTypeDto));
}
export function useOpsLive(depotId?: string) {
  const me = useMe(),
    client = useQueryClient();
  useEffect(() => {
    if (!me.data) return;
    const roles = me.data.roles,
      rooms = depotId
        ? ["depot:" + depotId]
        : roles.some((r) => ["STATE_ADMIN", "SUPER_ADMIN", "TRANSPORT_OFFICER"].includes(r.role))
          ? ["state"]
          : [
              ...new Set(
                roles.flatMap((r) =>
                  r.districtId
                    ? ["district:" + r.districtId]
                    : r.depotId
                      ? ["depot:" + r.depotId]
                      : [],
                ),
              ),
            ];
    const off = rooms.map(subscribeRoom),
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
  }, [depotId, me.data, client]);
}
