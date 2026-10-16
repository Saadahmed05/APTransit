import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RequireAuth } from "../../../../components/require-auth";
import { TravellersStep } from "./travellers-step";

interface BookSeatPageProps {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("book.title") };
}

/** D-048 /book/[tripId]: step 1, boarding and destination, Adult, Child and Senior counts, fare bar. */
export default async function BookSeatPage({ params, searchParams }: BookSeatPageProps) {
  const { tripId } = await params;
  const { from, to } = await searchParams;
  return (
    <RequireAuth>
      <TravellersStep tripId={tripId} initialFrom={from} initialTo={to} />
    </RequireAuth>
  );
}
