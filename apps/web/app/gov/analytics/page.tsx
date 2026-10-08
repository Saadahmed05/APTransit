import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AnalyticsClient } from "./analytics-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("nav.analytics") };
}

export default function GovAnalyticsPage() {
  return (
    <Suspense>
      <AnalyticsClient />
    </Suspense>
  );
}
