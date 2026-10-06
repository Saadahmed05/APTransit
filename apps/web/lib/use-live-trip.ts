"use client";
import { BusPositionEvent, IncidentDto, LiveTripDto, TripStatusEvent } from "@aptransit/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "./api";
import { liveSocket, shouldPollLive, subscribeRoom, useSocketConnected } from "./socket";
import { useNow } from "./use-browser-state";
export function useLiveTrip(tripId: string) {
  const client = useQueryClient();
  const connected = useSocketConnected();
  const now = useNow(1000);
  const key = ["tracking", "live", tripId];
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      api(`/tracking/trips/${tripId}/live`, { schema: LiveTripDto, signal, redirectOn401: false }),
    refetchInterval: shouldPollLive(now) ? 15_000 : false,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    const s = liveSocket();
    const leave = subscribeRoom(`trip:${tripId}`);
    const position = (value: unknown) => {
      const event = BusPositionEvent.safeParse(value);
      if (!event.success || event.data.tripId !== tripId) return;
      const e = event.data;
      client.setQueryData<LiveTripDto>(
        ["tracking", "live", tripId],
        (old) =>
          old && {
            ...old,
            position: {
              lat: e.lat,
              lng: e.lng,
              speedKmh: e.speedKmh,
              headingDeg: e.headingDeg,
              recordedAt: e.recordedAt,
            },
            delayMinutes: e.delayMinutes,
            progressPct: e.progressPct,
            etaNextStopSec: e.etaNextStopSec,
          },
      );
      void client.invalidateQueries({ queryKey: ["tracking", "live", tripId] });
    };
    const status = (value: unknown) => {
      const e = TripStatusEvent.safeParse(value);
      if (e.success && e.data.tripId === tripId)
        void client.invalidateQueries({ queryKey: ["tracking", "live", tripId] });
    };
    const incident = (value: unknown) => {
      const e = IncidentDto.safeParse(value);
      if (e.success && e.data.tripId === tripId)
        void client.invalidateQueries({ queryKey: ["tracking", "live", tripId] });
    };
    s.on("bus:position", position);
    s.on("trip:status", status);
    s.on("incident:new", incident);
    s.on("incident:update", incident);
    if (connected) void client.invalidateQueries({ queryKey: ["tracking", "live", tripId] });
    return () => {
      leave();
      s.off("bus:position", position);
      s.off("trip:status", status);
      s.off("incident:new", incident);
      s.off("incident:update", incident);
    };
  }, [tripId, client, connected]);
  return query;
}
