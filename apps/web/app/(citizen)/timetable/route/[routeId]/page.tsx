import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RouteTimetableClient } from "./route-timetable-client";

interface RouteTimetablePageProps {
  params: Promise<{
    routeId: string;
  }>;
  searchParams: Promise<{
    date?: string;
  }>;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: t("timetable.title"),
  };
}

export default async function RouteTimetablePage({
  params,
  searchParams,
}: RouteTimetablePageProps) {
  const { routeId } = await params;
  const search = await searchParams;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <RouteTimetableClient
        routeId={routeId}
        initialDate={search.date}
      />
    </div>
  );
}
