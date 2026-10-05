"use client";

import { UnreadCountDto } from "@aptransit/shared";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { api } from "../lib/api";
import { queryKeys } from "../lib/query-keys";
import { useAuth } from "./auth-provider";

const POLL_MS = 60_000;

/** Top bar bell with the unread count (polled every 60 s until sockets arrive on Day 12). */
export function NotificationBell({ className }: { className: string }) {
  const t = useTranslations();
  const { status } = useAuth();
  const query = useQuery({
    queryKey: queryKeys.unreadCount,
    queryFn: ({ signal }) => api("/notifications/unread-count", { schema: UnreadCountDto, signal, redirectOn401: false }),
    enabled: status === "authenticated",
    refetchInterval: POLL_MS,
  });
  const count = status === "authenticated" ? (query.data?.count ?? 0) : 0;

  return (
    <Link href="/updates" aria-label={t("updates.bell", { count })} className={`relative ${className}`}>
      <Bell className="size-5" aria-hidden="true" />
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute right-1 top-1 flex min-w-5 items-center justify-center rounded-full bg-status-danger-solid px-1 text-caption tabular-nums text-on-solid"
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
