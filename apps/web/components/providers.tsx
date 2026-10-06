"use client";

import { Toaster } from "@aptransit/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { isApiError } from "../lib/api";
import { LiveEvents } from "./live-events";
import { AuthProvider } from "./auth-provider";
import { ServiceWorkerRegistration } from "./service-worker";

/** One retry for server and network errors, none for 4xx: those will not fix themselves. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        staleTime: 30_000,
        // Off by default. Ticket screens turn it on (Day 7) where fresh status matters.
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}

export function Providers({ hasSession, children }: { hasSession: boolean; children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider hasSession={hasSession}>
        {children}
        <Toaster />
        <ServiceWorkerRegistration />
        <LiveEvents />
      </AuthProvider>
    </QueryClientProvider>
  );
}
