"use client";

import { type TicketScope, TicketsResponse } from "@aptransit/shared";
import { Button, EmptyState, ErrorState, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@aptransit/ui";
import { useQuery } from "@tanstack/react-query";
import { Ticket } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TicketSummaryCard } from "../../../components/ticket-summary-card";
import { api, errorKey } from "../../../lib/api";
import { queryKeys } from "../../../lib/query-keys";

const SCOPES: TicketScope[] = ["upcoming", "past"];

export function TicketsView({ tab }: { tab: TicketScope }) {
  const t = useTranslations();
  const router = useRouter();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1 text-fg">{t("tickets.title")}</h1>
      <Tabs
        value={tab}
        // The tab lives in the URL so Back and a shared link keep it
        onValueChange={(next) => router.replace(next === "past" ? "/tickets?tab=past" : "/tickets")}
      >
        <TabsList className="w-full sm:w-auto">
          {SCOPES.map((scope) => (
            <TabsTrigger key={scope} value={scope} className="min-h-11 flex-1 sm:flex-none">
              {t(`tickets.tabs.${scope}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        {SCOPES.map((scope) => (
          <TabsContent key={scope} value={scope} className="mt-4">
            {scope === tab && <TicketList scope={scope} />}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function TicketList({ scope }: { scope: TicketScope }) {
  const t = useTranslations();
  const query = useQuery({
    queryKey: queryKeys.tickets(scope),
    queryFn: ({ signal }) => api("/tickets", { query: { scope }, schema: TicketsResponse, signal }),
    refetchOnWindowFocus: true,
  });

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <span className="sr-only" role="status">
          {t("common.loading")}
        </span>
        <Skeleton className="h-36 w-full rounded-lg" />
        <Skeleton className="h-36 w-full rounded-lg" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <ErrorState
        title={t("tickets.errorTitle")}
        message={t(errorKey(query.error, (k) => t.has(k)))}
        retryLabel={t("common.retry")}
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (!query.data || query.data.length === 0) {
    return scope === "upcoming" ? (
      <EmptyState
        icon={Ticket}
        title={t("tickets.emptyTitle")}
        hint={t("tickets.emptyHint")}
        action={
          <Button asChild>
            <Link href="/">{t("tickets.search")}</Link>
          </Button>
        }
      />
    ) : (
      <EmptyState icon={Ticket} title={t("tickets.emptyPastTitle")} />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {query.data.map((ticket) => (
        <li key={ticket.id}>
          <TicketSummaryCard ticket={ticket} />
        </li>
      ))}
    </ul>
  );
}
