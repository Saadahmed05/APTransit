import { getTranslations } from "next-intl/server";
import { TrackEntry } from "./track-entry";
export async function generateMetadata() {
  const t = await getTranslations("tracking");
  return { title: t("title") };
}
export default function Page() {
  return <TrackEntry />;
}
