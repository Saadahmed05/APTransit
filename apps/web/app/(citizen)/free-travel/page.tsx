import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RequireAuth } from "../../../components/require-auth";
import { FreeTravelView } from "./free-travel-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("freeTravel.title") };
}

/** docs/11 /free-travel and docs/07 section 9: explainer, consent, declaration, ID type, result. */
export default function FreeTravelPage() {
  return (
    <RequireAuth>
      <FreeTravelView />
    </RequireAuth>
  );
}
