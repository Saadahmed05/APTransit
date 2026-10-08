import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ComplaintsClient } from "./complaints-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("nav.complaints") };
}

export default function OpsComplaintsPage() {
  return (
    <Suspense>
      <ComplaintsClient />
    </Suspense>
  );
}
