import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RequireAuth } from "../../../components/require-auth";
import { TicketsView } from "./tickets-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("tickets.title") };
}

/** docs/11 /tickets: tabs Upcoming and Past (in the URL), sorted by departure. */
export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  return (
    <RequireAuth>
      <TicketsView tab={tab === "past" ? "past" : "upcoming"} />
    </RequireAuth>
  );
}
