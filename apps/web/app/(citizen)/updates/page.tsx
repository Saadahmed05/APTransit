import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RequireAuth } from "../../../components/require-auth";
import { UpdatesView } from "./updates-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("updates.title") };
}

/** docs/11 /updates: notifications grouped by day, unread dots, Mark all read. */
export default function UpdatesPage() {
  return (
    <RequireAuth>
      <UpdatesView />
    </RequireAuth>
  );
}
