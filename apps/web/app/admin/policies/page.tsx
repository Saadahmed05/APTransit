import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Skeleton } from "@aptransit/ui";
import PoliciesClient from "./policies-client";

export async function generateMetadata() {
  const t = await getTranslations("adminApp");
  return { title: t("policiesTitle") };
}

export default function PoliciesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <PoliciesClient />
    </Suspense>
  );
}
