import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DriverReport } from "./driver-report";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("driverApp.report.title") };
}

/** docs/11 /driver/report: big tiles, an optional note; the server adds trip, bus and location. */
export default function DriverReportPage() {
  return <DriverReport />;
}
