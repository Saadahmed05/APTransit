"use client";

import { useSyncExternalStore } from "react";

// Browser state read with useSyncExternalStore (handoff: never setState inside an effect for this).

const subscribeOnline = (notify: () => void) => {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
};

/** navigator.onLine, assumed true on the server. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

/** One ticking store per interval, shared by every component that asks for it. */
const clocks = new Map<number, { now: number; listeners: Set<() => void>; timer: number | null }>();

function clockFor(intervalMs: number) {
  let clock = clocks.get(intervalMs);
  if (!clock) {
    clock = { now: Date.now(), listeners: new Set(), timer: null };
    clocks.set(intervalMs, clock);
  }
  return clock;
}

/**
 * Date.now(), updated every intervalMs (aligned to the interval boundary, so a 1 s clock ticks on
 * the second). 0 on the server and in the first client render, so markup never mismatches.
 */
export function useNow(intervalMs = 1_000): number {
  return useSyncExternalStore(
    (notify) => {
      const clock = clockFor(intervalMs);
      clock.listeners.add(notify);
      if (clock.timer === null) {
        const tick = () => {
          clock.now = Date.now();
          clock.listeners.forEach((listener) => listener());
          clock.timer = window.setTimeout(tick, intervalMs - (Date.now() % intervalMs));
        };
        clock.now = Date.now();
        clock.timer = window.setTimeout(tick, intervalMs - (Date.now() % intervalMs));
      }
      return () => {
        clock.listeners.delete(notify);
        if (clock.listeners.size === 0 && clock.timer !== null) {
          window.clearTimeout(clock.timer);
          clock.timer = null;
        }
      };
    },
    () => clockFor(intervalMs).now,
    () => 0,
  );
}
