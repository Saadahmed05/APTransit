import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OfflineView } from "./offline-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("offlinePage.title") };
}

/** docs/11 /offline: the service worker's fallback page. Precached, so it needs no network. */
export default function OfflinePage() {
  return (
    <main id="main-content" className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 px-gutter py-10">
      <OfflineView />
    </main>
  );
}
