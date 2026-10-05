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
