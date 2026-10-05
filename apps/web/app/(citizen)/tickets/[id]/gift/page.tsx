import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RequireAuth } from "../../../../../components/require-auth";
import { GiftView } from "./gift-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("gift.title") };
}

/** docs/11 /tickets/[id]/gift: one field, the rules in one line, a confirmation that names the consequence. */
export default async function GiftTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RequireAuth>
      <GiftView id={id} />
    </RequireAuth>
  );
}
