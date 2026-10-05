import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DriverHome } from "./driver-home";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("shell.driver") };
}

/** docs/11 /driver: today's bus, route and departure, device state, one big Start trip. */
export default function DriverHomePage() {
  return <DriverHome />;
}
