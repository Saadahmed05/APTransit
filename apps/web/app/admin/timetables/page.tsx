import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Skeleton } from "@aptransit/ui";
import TimetablesClient from "./timetables-client";

export async function generateMetadata() {
  const t = await getTranslations("adminApp");
  return { title: t("timetablesTitle") };
}

export default function TimetablesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <TimetablesClient />
    </Suspense>
  );
}
