"use client";

import { DriverTodayDto } from "@aptransit/shared";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { useDeviceKey } from "./driver-device";

export const driverTodayKey = (deviceKey: string | null) => ["driver", "today", deviceKey ?? ""] as const;

/** GET /driver/today with this phone's key, so the answer says whether this phone is approved. */
export function useDriverToday(refetchInterval: number | false = false) {
  const deviceKey = useDeviceKey();
  const query = useQuery({
    queryKey: driverTodayKey(deviceKey),
    queryFn: ({ signal }) =>
      api("/driver/today", { schema: DriverTodayDto, signal, headers: deviceKey ? { "X-Device-Key": deviceKey } : undefined }),
    refetchInterval,
    refetchOnWindowFocus: true,
  });
  return { ...query, deviceKey };
}
