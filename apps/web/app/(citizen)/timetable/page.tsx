import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TimetableClient } from "./timetable-client";

interface TimetablePageProps {
  searchParams: Promise<{
    district?: string;
    busStand?: string;
  }>;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: t("timetable.title"),
  };
}

export default async function TimetablePage({ searchParams }: TimetablePageProps) {
  const params = await searchParams;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <TimetableClient
        initialDistrictId={params.district}
        initialBusStandId={params.busStand}
      />
    </div>
  );
}
