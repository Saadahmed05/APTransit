"use client";

import { formatDate, formatIstDate, messageLocale, type NotificationDto, NotificationsPage, notificationParams } from "@aptransit/shared";
import { Button, EmptyState, ErrorState, Skeleton } from "@aptransit/ui";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bell,
  BellRing,
  Bus,
  CalendarX,
  CheckCheck,
  Gift,
  type LucideIcon,
  MapPin,
  MessageSquare,
  Repeat,
  Ticket,
  Timer,
  TimerOff,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { api, errorKey, isApiError } from "../../../lib/api";
import { queryKeys } from "../../../lib/query-keys";
import { useNow } from "../../../lib/use-browser-state";

const PAGE_SIZE = 20;
const DAY_MS = 86_400_000;

const TYPE_ICON: Record<NotificationDto["type"], LucideIcon> = {
  BOOKING_CONFIRMED: Ticket,
  TICKET_ACTIVATED: BellRing,
  TICKET_RECEIVED: Gift,
  TRIP_DEPARTED: Bus,
  TRIP_DELAYED: Timer,
  BUS_NEAR_STOP: MapPin,
  TRIP_CANCELLED: CalendarX,
  REPLACEMENT_BUS: Repeat,
  ROUTE_UPDATE: AlertTriangle,
  PASS_EXPIRING: TimerOff,
  COMPLAINT_UPDATE: MessageSquare,
};

export function UpdatesView() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const now = useNow(60_000);

  const query = useInfiniteQuery({
    queryKey: queryKeys.notifications,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api("/notifications", { query: { limit: PAGE_SIZE, cursor: pageParam }, schema: NotificationsPage, signal }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchOnWindowFocus: true,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
  };
  const markOne = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: "POST" }),
    onSettled: refresh,
  });
  const markAll = useMutation({
    mutationFn: () => api("/notifications/read-all", { method: "POST" }),
    onSettled: refresh,
  });

  if (query.isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-3" aria-busy="true">
        <span className="sr-only" role="status">
          {t("common.loading")}
        </span>
        <Skeleton className="h-9 w-40" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <ErrorState
        headingLevel="h1"
        title={t("updates.errorTitle")}
        message={t(errorKey(query.error, (k) => t.has(k)))}
        requestId={isApiError(query.error) ? query.error.requestId : undefined}
        retryLabel={t("common.retry")}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const items = query.data.pages.flatMap((page) => page.items);
  if (items.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <h1 className="text-h1 text-fg">{t("updates.title")}</h1>
        <EmptyState icon={Bell} title={t("updates.emptyTitle")} hint={t("updates.emptyHint")} />
      </div>
    );
  }

  // Grouped by day in Asia/Kolkata, newest first
  const today = now ? formatIstDate(new Date(now)) : "";
  const yesterday = now ? formatIstDate(new Date(now - DAY_MS)) : "";
  const groups = new Map<string, NotificationDto[]>();
  for (const item of items) {
    const day = formatIstDate(new Date(item.createdAt));
    groups.set(day, [...(groups.get(day) ?? []), item]);
  }
  const dayLabel = (day: string) =>
    day === today ? t("updates.today") : day === yesterday ? t("updates.yesterday") : formatDate(new Date(`${day}T00:00:00.000Z`), locale);
  const relative = new Intl.RelativeTimeFormat(locale === "te" ? "te-IN" : "en-IN", { numeric: "auto" });
  const ago = (iso: string) => {
    if (!now) return "";
    const minutes = Math.round((Date.parse(iso) - now) / 60_000);
    if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return relative.format(hours, "hour");
    return relative.format(Math.round(hours / 24), "day");
  };
  const unread = items.some((item) => item.readAt === null);

  const open = (item: NotificationDto) => {
    if (item.readAt === null) markOne.mutate(item.id);
    if (item.link) router.push(item.link);
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h1 text-fg">{t("updates.title")}</h1>
        {unread && (
          <Button variant="ghost" loading={markAll.isPending} onClick={() => markAll.mutate()} leftIcon={<CheckCheck className="size-4" aria-hidden="true" />}>
            {t("updates.markAll")}
          </Button>
        )}
      </div>

      {[...groups.entries()].map(([day, dayItems]) => (
        <section key={day} aria-labelledby={`day-${day}`} className="flex flex-col gap-2">
          <h2 id={`day-${day}`} className="text-small font-semibold text-muted">
            {dayLabel(day)}
          </h2>
          <ul className="flex flex-col gap-2">
            {dayItems.map((item) => {
              const Icon = TYPE_ICON[item.type] ?? Bell;
              const params = notificationParams(item.params, messageLocale(locale));
              const isUnread = item.readAt === null;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => open(item)}
                    className="flex w-full items-start gap-3 rounded-lg border border-default bg-surface-raised p-3 text-left transition-colors duration-fast hover:border-strong"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-muted">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-start justify-between gap-2">
                        <span className={isUnread ? "text-body font-semibold text-fg" : "text-body text-fg"}>
                          {t(`notifications.${item.type}.title`, params)}
                        </span>
                        <span className="shrink-0 text-caption text-subtle">{ago(item.createdAt)}</span>
                      </span>
                      <span className="text-small text-muted">{t(`notifications.${item.type}.body`, params)}</span>
                    </span>
                    {isUnread && (
                      <span className="mt-1 flex shrink-0 items-center">
                        <span className="size-2.5 rounded-full bg-primary" aria-hidden="true" />
                        <span className="sr-only">{t("updates.unread")}</span>
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {query.hasNextPage && (
        <Button variant="secondary" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
          {t("updates.loadMore")}
        </Button>
      )}
    </div>
  );
}
