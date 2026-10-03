import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BusDetailClient } from "./bus-detail-client";

interface BusDetailPageProps {
  params: Promise<{
    tripId: string;
  }>;
  searchParams: Promise<{
    from?: string;
    to?: string;
  }>;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: t("bus.title"),
  };
}

export default async function BusDetailPage({
  params,
  searchParams,
}: BusDetailPageProps) {
  const { tripId } = await params;
  const search = await searchParams;
  const t = await getTranslations();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="sr-only">{t("bus.title")}</h1>
      <BusDetailClient
        tripId={tripId}
        initialFrom={search.from}
        initialTo={search.to}
      />
    </div>
  );
}
