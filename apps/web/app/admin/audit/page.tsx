import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Skeleton } from "@aptransit/ui";
import AuditClient from "./audit-client";

export async function generateMetadata() {
  const t = await getTranslations("adminApp");
  return { title: t("auditTitle") };
}

export default function AuditPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <AuditClient />
    </Suspense>
  );
}
