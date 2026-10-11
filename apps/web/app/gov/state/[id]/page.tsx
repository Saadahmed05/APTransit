import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CommandCenter } from "../../command-center";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("govApp");
  return { title: t("state") };
}

/** One state's command center (D-034): the SUPER_ADMIN state picker and state breadcrumbs link here. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CommandCenter stateId={id} />;
}
