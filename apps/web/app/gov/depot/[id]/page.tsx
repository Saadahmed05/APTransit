import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DepotView } from "../../drill-down";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("govApp");
  return { title: t("depot") };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DepotView id={id} />;
}
