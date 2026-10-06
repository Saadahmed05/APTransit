import { getTranslations } from "next-intl/server";
import { TrackTrip } from "./track-trip";
export async function generateMetadata() {
  const t = await getTranslations("tracking");
  return { title: t("title") };
}
export default async function Page({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return <TrackTrip tripId={tripId} />;
}
