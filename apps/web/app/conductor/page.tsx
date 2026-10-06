import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ConductorHome } from "./conductor-home";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("shell.conductor") };
}

export default async function ConductorHomePage() {
  return <ConductorHome />;
}
