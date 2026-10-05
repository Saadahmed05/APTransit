"use client";

import { toast } from "@aptransit/ui";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { listenForInstallPrompt } from "../lib/install-prompt";

/** Asks the active service worker to drop cached tickets and pages (logout). */
export function clearServiceWorkerUserData(): void {
  try {
    navigator.serviceWorker?.controller?.postMessage("CLEAR_USER_DATA");
  } catch {
    // No service worker: nothing cached
  }
}

/**
 * Registers public/sw.js in production builds only. A new version waits; the user sees an
 * "Update available" toast with Reload, which tells it to take over and reloads once.
 */
export function ServiceWorkerRegistration() {
  const t = useTranslations("pwa");

  useEffect(() => {
    listenForInstallPrompt();
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };

    const offerUpdate = (worker: ServiceWorker) => {
      toast(t("updateAvailable"), {
        duration: Infinity,
        action: {
          label: t("reload"),
          onClick: () => {
            navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
            worker.postMessage("SKIP_WAITING");
          },
        },
      });
    };

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((registration) => {
        // Only offer an update when a page is already controlled (not on the first install)
        if (registration.waiting && navigator.serviceWorker.controller) offerUpdate(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          installing?.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) offerUpdate(installing);
          });
        });
      })
      .catch(() => {
        // Registration failed (private mode, blocked): the app still works online
      });

    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, [t]);

  return null;
}
