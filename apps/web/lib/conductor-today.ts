"use client";
import { ConductorTodayDto } from "@aptransit/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "./api";
import { liveSocket, subscribeRoom, useSocketConnected } from "./socket";
export function useConductorToday() {
  const connected = useSocketConnected(),
    client = useQueryClient();
  const query = useQuery({
    queryKey: ["conductor", "today"],
    queryFn: ({ signal }) => api("/conductor/today", { schema: ConductorTodayDto, signal }),
    refetchInterval: connected ? false : 15_000,
  });
  const tripId = query.data?.trip?.id;
  useEffect(() => {
    if (!tripId) return;
    const off = subscribeRoom("trip:" + tripId),
      socket = liveSocket();
    const update = () => {
      void client.invalidateQueries({ queryKey: ["conductor"] });
    };
    socket.on("conductor:counts", update);
    socket.on("trip:status", update);
    socket.on("connect", update);
    return () => {
      off();
      socket.off("conductor:counts", update);
      socket.off("trip:status", update);
      socket.off("connect", update);
    };
  }, [tripId, client]);
  return query;
}
