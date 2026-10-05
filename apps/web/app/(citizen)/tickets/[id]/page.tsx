import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RequireAuth } from "../../../../components/require-auth";
import { TicketView } from "./ticket-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("ticketDetail.title") };
}

/** docs/11 /tickets/[id]: the full ticket, live QR when active, activation, gift and cancel. */
export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RequireAuth>
      <TicketView id={id} />
    </RequireAuth>
  );
}
