import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RequireAuth } from "../../../../../components/require-auth";
import { CancelView } from "./cancel-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("ticketCancel.title") };
}

/** docs/11 /tickets/[id]/cancel: refund quote, policy line, Cancel ticket (danger) with a confirmation. */
export default async function CancelTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RequireAuth>
      <CancelView id={id} />
    </RequireAuth>
  );
}
