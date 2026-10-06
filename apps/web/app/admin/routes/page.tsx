import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Skeleton } from "@aptransit/ui";
import RoutesClient from "./routes-client";

export async function generateMetadata() {
  const t = await getTranslations("adminApp");
  return { title: t("routesTitle") };
}

export default function RoutesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <RoutesClient />
    </Suspense>
  );
}
