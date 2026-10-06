import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Skeleton } from "@aptransit/ui";
import StopsClient from "./stops-client";

export async function generateMetadata() {
  const t = await getTranslations("adminApp");
  return { title: t("stopsTitle") };
}

export default function StopsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <StopsClient />
    </Suspense>
  );
}
