"use client";

import { useSyncExternalStore } from "react";

// beforeinstallprompt fires early, often before the account page mounts. We keep the event here
// and show "Install app" only when the browser offered it (never a pop up on load).

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
let listening = false;

function notify() {
  listeners.forEach((listener) => listener());
}

function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

const subscribe = (listener: () => void) => {
  listen();
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const canInstall = () => deferred !== null;

/** iPhone, iPad (also iPadOS posing as a Mac) in Safari and not yet installed: no prompt exists, show steps instead. */
function needsIosSteps(): boolean {
  if (typeof navigator === "undefined") return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}
const subscribeNone = () => () => {};

export function useIosInstallSteps(): boolean {
  return useSyncExternalStore(subscribeNone, needsIosSteps, () => false);
}
const serverCanInstall = () => false;

/** Start listening as soon as the app loads (called from the service worker registration). */
export function listenForInstallPrompt(): void {
  listen();
}

export function useInstallPrompt(): { canInstall: boolean; install: () => Promise<void> } {
  const available = useSyncExternalStore(subscribe, canInstall, serverCanInstall);
  return {
    canInstall: available,
    install: async () => {
      if (!deferred) return;
      const event = deferred;
      await event.prompt();
      await event.userChoice;
      deferred = null;
      notify();
    },
  };
}
