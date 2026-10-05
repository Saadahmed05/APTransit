"use client";

import { useSyncExternalStore } from "react";

// Browser state read with useSyncExternalStore (handoff: never setState inside an effect for this).
// subscribe and getSnapshot must keep the same identity between renders, or React resubscribes on
// every render (and a snapshot that changes on subscribe then loops forever).

const subscribeOnline = (notify: () => void) => {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
};
const readOnline = () => navigator.onLine;
const serverOnline = () => true;

/** navigator.onLine, assumed true on the server. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, readOnline, serverOnline);
}

interface Clock {
  now: number;
  listeners: Set<() => void>;
  timer: number | null;
  subscribe: (notify: () => void) => () => void;
  read: () => number;
}

/** One ticking store per interval, shared by every component that asks for it. */
const clocks = new Map<number, Clock>();
const serverNow = () => 0;

function clockFor(intervalMs: number): Clock {
  const existing = clocks.get(intervalMs);
  if (existing) return existing;
  const clock: Clock = {
    now: 0,
    listeners: new Set(),
    timer: null,
    subscribe: (notify) => {
      clock.listeners.add(notify);
      if (clock.timer === null) {
        const tick = () => {
          clock.now = Date.now();
          clock.listeners.forEach((listener) => listener());
          clock.timer = window.setTimeout(tick, intervalMs - (Date.now() % intervalMs));
        };
        // First tick at once (async), then on each interval boundary
        clock.timer = window.setTimeout(tick, 0);
      }
      return () => {
        clock.listeners.delete(notify);
        if (clock.listeners.size === 0 && clock.timer !== null) {
          window.clearTimeout(clock.timer);
          clock.timer = null;
          // A stale time must never show when the clock starts again
          clock.now = 0;
        }
      };
    },
    read: () => clock.now,
  };
  clocks.set(intervalMs, clock);
  return clock;
}

/**
 * Date.now(), updated every intervalMs (aligned to the interval boundary, so a 1 s clock ticks on
 * the second). 0 on the server and until the first tick, so markup never mismatches.
 */
export function useNow(intervalMs = 1_000): number {
  const clock = clockFor(intervalMs);
  return useSyncExternalStore(clock.subscribe, clock.read, serverNow);
}
