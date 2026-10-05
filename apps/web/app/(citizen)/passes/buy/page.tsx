import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RequireAuth } from "../../../../components/require-auth";
import { BuyPassView } from "./buy-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("passBuy.title") };
}

/** docs/11 /passes/buy: pass types as cards with price, validity and services; select, then pay. */
export default function BuyPassPage() {
  return (
    <RequireAuth>
      <BuyPassView />
    </RequireAuth>
  );
}
