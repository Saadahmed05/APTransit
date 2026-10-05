import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RequireAuth } from "../../../../../components/require-auth";
import { FreeSeatView } from "./free-seat-view";

interface FreeSeatPageProps {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("freeSeat.title") };
}

/** Day 9: one seat at zero fare with an active free travel pass (docs/07 section 9, item 7). No payment step. */
export default async function FreeSeatPage({ params, searchParams }: FreeSeatPageProps) {
  const { tripId } = await params;
  const { from, to } = await searchParams;
  return (
    <RequireAuth>
      <FreeSeatView tripId={tripId} initialFrom={from} initialTo={to} />
    </RequireAuth>
  );
}
