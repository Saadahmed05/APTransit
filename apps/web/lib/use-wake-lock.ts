"use client";

import { useEffect, useState } from "react";

/**
 * Keeps the screen on while `active` (docs/13: a web app cannot send GPS with the screen off).
 * Re acquired on visibilitychange, since the browser releases it when the tab is hidden.
 * `supported` false means the driver should keep the screen on by hand.
 */
export function useWakeLock(active: boolean): { supported: boolean } {
  const [supported] = useState(() => typeof navigator !== "undefined" && "wakeLock" in navigator);

  useEffect(() => {
    if (!active || !supported) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        lock = await navigator.wakeLock.request("screen");
        if (cancelled) void lock.release();
      } catch {
        // Battery saver or a policy refused it: the tip on screen covers this
      }
    };
    const onVisibility = () => void acquire();
    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void lock?.release().catch(() => undefined);
    };
  }, [active, supported]);

  return { supported };
}
