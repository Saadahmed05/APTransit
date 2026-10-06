import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Skeleton } from "@aptransit/ui";
import AdminOverviewClient from "./admin-overview-client";

export async function generateMetadata() {
  const t = await getTranslations("adminApp");
  return { title: t("overview") };
}

export default function AdminOverviewPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <AdminOverviewClient />
    </Suspense>
  );
}
