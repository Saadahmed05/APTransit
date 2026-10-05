"use client";

import { type AuthVerifyResponse, MeDto } from "@aptransit/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { api, refreshAccessToken, setUnauthenticatedHandler } from "../lib/api";
import { clearOfflineTickets } from "../lib/offline-tickets";
import { clearServiceWorkerUserData } from "./service-worker";
import { queryKeys } from "../lib/query-keys";
import { getServerSessionState, sessionStore } from "../lib/session";

export type AuthStatus = "loading" | "authenticated" | "anonymous" | "error";

interface AuthContextValue {
  status: AuthStatus;
  /** True after Log out: guarded pages must not send the user to /login on the way home. */
  loggingOut: boolean;
  /** Retry the silent refresh after a network error. */
  retry: () => void;
  login: (result: AuthVerifyResponse) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Tells other tabs that this browser logged out, so they drop their in memory token too. */
const CHANNEL = "apt-auth";

export interface AuthProviderProps {
  /** The server saw the apt_session marker cookie (D-016), so a silent refresh is worth trying. */
  hasSession: boolean;
  children: ReactNode;
}

/**
 * Session for every surface (docs/12, Tokens on the web). The access token lives in memory only.
 * On first load it refreshes silently when the marker cookie says a session exists.
 */
export function AuthProvider({ hasSession, children }: AuthProviderProps) {
  const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.get, getServerSessionState);
  const queryClient = useQueryClient();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const bootstrap = useQuery({
    queryKey: queryKeys.sessionBootstrap,
    queryFn: refreshAccessToken,
    enabled: hasSession && session.status === "unknown",
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });

  useEffect(() => {
    setUnauthenticatedHandler(() => {
      const next = `${window.location.pathname}${window.location.search}`;
      queryClient.removeQueries({ queryKey: queryKeys.me });
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    });
  }, [queryClient, router]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (event: MessageEvent) => {
      if (event.data === "logout") {
        sessionStore.clear();
        void clearOfflineTickets();
        clearServiceWorkerUserData();
        queryClient.removeQueries({ queryKey: queryKeys.me });
        router.refresh();
      }
    };
    return () => channel.close();
  }, [queryClient, router]);

  let status: AuthStatus;
  if (session.status === "authenticated") status = "authenticated";
  else if (session.status === "anonymous" || !hasSession) status = "anonymous";
  else if (bootstrap.isError) status = "error";
  else status = "loading";

  const retry = useCallback(() => {
    void bootstrap.refetch();
  }, [bootstrap]);

  const login = useCallback(
    (result: AuthVerifyResponse) => {
      setLoggingOut(false);
      sessionStore.setAccessToken(result.accessToken);
      queryClient.setQueryData(queryKeys.me, result.user);
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await api("/auth/logout", { method: "POST", redirectOn401: false });
    } catch {
      // The cookie is cleared by the API when it answers; locally we log out either way.
    }
    sessionStore.clear();
    queryClient.clear();
    // Saved offline tickets belong to this session only
    await clearOfflineTickets();
    clearServiceWorkerUserData();
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(CHANNEL);
      channel.postMessage("logout");
      channel.close();
    }
    router.replace("/");
    router.refresh();
  }, [queryClient, router]);

  const value = useMemo(
    () => ({ status, loggingOut, retry, login, logout }),
    [status, loggingOut, retry, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth needs AuthProvider");
  return ctx;
}

/** The logged in user (GET /me). Disabled until the session is known. */
export function useMe() {
  const { status } = useAuth();
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: ({ signal }) => api("/me", { schema: MeDto, signal }),
    enabled: status === "authenticated",
    staleTime: 5 * 60_000,
  });
}
