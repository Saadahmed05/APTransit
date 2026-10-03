import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RequireAuth } from "../../../../../components/require-auth";
import { DoneView } from "./done-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("book.done.title") };
}

/** docs/11 /book/done/[bookingId]: calm confirmation, ticket preview, activation hint. */
export default async function BookingDonePage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  return (
    <RequireAuth>
      <DoneView bookingId={bookingId} />
    </RequireAuth>
  );
}
