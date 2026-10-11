"use client";

import { AuthVerifyResponse } from "@aptransit/shared";
import { useLocale } from "next-intl";
import { useEffect, useRef } from "react";
import { api } from "../lib/api";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const GSI_SRC = "https://accounts.google.com/gsi/client";

interface GoogleId {
  initialize(config: {
    client_id: string;
    callback: (r: { credential: string }) => void;
    ux_mode?: "popup";
  }): void;
  renderButton(el: HTMLElement, opts: Record<string, string | number>): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

let loading: Promise<void> | null = null;
function loadGsi(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      reject(new Error("gsi"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export const googleSignInEnabled = CLIENT_ID.length > 0;

/**
 * D-043: the official "Sign in with Google" button (Google Identity Services). The ID token goes
 * to POST /auth/google; the API checks it with Google and starts the same session as OTP login.
 */
export function GoogleSignIn({
  onSignedIn,
  onError,
}: {
  onSignedIn: (result: AuthVerifyResponse) => void;
  onError: (error: unknown) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const locale = useLocale();
  const handlers = useRef({ onSignedIn, onError });
  useEffect(() => {
    handlers.current = { onSignedIn, onError };
  });

  useEffect(() => {
    if (!googleSignInEnabled) return;
    let alive = true;
    loadGsi()
      .then(() => {
        const id = window.google?.accounts.id;
        if (!alive || !id || !box.current) return;
        id.initialize({
          client_id: CLIENT_ID,
          ux_mode: "popup",
          callback: ({ credential }) => {
            api("/auth/google", {
              method: "POST",
              body: { credential },
              schema: AuthVerifyResponse,
              redirectOn401: false,
            })
              .then((result) => handlers.current.onSignedIn(result))
              .catch((error: unknown) => handlers.current.onError(error));
          },
        });
        id.renderButton(box.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          shape: "pill",
          text: "continue_with",
          width: box.current.clientWidth || 320,
          locale: locale === "te" ? "te" : "en",
        });
      })
      .catch((error: unknown) => handlers.current.onError(error));
    return () => {
      alive = false;
    };
  }, [locale]);

  if (!googleSignInEnabled) return null;
  return (
    <div ref={box} className="flex min-h-11 w-full justify-center" data-testid="google-sign-in" />
  );
}
