"use client";

import { useSyncExternalStore } from "react";

// Day 11: the device key is shown once by POST /driver/devices and kept on this phone only
// (localStorage, try/catch everywhere). Pings send it in X-Device-Key.

const KEY = "apt.driver.deviceKey";
const listeners = new Set<() => void>();

export function readDeviceKey(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveDeviceKey(value: string): void {
  try {
    window.localStorage.setItem(KEY, value);
  } catch {
    // Storage blocked: the key lives until the tab closes
    memoryKey = value;
  }
  listeners.forEach((listener) => listener());
}

let memoryKey: string | null = null;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
};
const read = () => readDeviceKey() ?? memoryKey;
const serverRead = () => null;

/** The stored device key, null when this phone is not registered (or on the server). */
export function useDeviceKey(): string | null {
  return useSyncExternalStore(subscribe, read, serverRead);
}
