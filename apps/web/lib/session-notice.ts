"use client";

import { useSyncExternalStore } from "react";

// D-051 one device per citizen: the login page explains why this device was signed out.
const KEY = "apt-signed-out-elsewhere";

export function markSignedOutElsewhere(): void {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    // Storage blocked: the login page just shows no note
  }
}

export function clearSignedOutElsewhere(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear
  }
}

const noop = () => () => {};
const read = () => {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

/** True after a sign in on another device ended this session (read after mount, so no hydration mismatch). */
export function useSignedOutElsewhere(): boolean {
  return useSyncExternalStore(noop, read, () => false);
}
