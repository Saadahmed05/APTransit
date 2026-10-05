import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DriverTrip } from "./driver-trip";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("driverApp.trip.active") };
}

/** docs/11 /driver/trip/[id]: trip active, GPS status, next stop and ETA, Report issue, End trip. */
export default async function DriverTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DriverTrip tripId={id} />;
}
