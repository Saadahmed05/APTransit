import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RequireAuth } from "../../../components/require-auth";
import { PassesView } from "./passes-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("passes.title") };
}

/** docs/11 /passes: the active pass with its countdown and QR, passes to activate, history. */
export default function PassesPage() {
  return (
    <RequireAuth>
      <PassesView />
    </RequireAuth>
  );
}
