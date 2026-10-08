import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CommandCenter } from "./command-center";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("nav.commandCenter") };
}

export default function GovCommandCenterPage() {
  return <CommandCenter />;
}
