import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DriverSetup } from "./driver-setup";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("driverApp.setup.title") };
}

/** docs/11 /driver/setup: register this phone, then wait for the depot's approval. */
export default function DriverSetupPage() {
  return <DriverSetup />;
}
