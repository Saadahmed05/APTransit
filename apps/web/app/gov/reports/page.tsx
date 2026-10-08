import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ReportsClient } from "./reports-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("nav.reports") };
}

export default function GovReportsPage() {
  return <ReportsClient />;
}
