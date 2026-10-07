import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RouteView } from "../../drill-down";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("govApp");
  return { title: t("route") };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RouteView id={id} />;
}
