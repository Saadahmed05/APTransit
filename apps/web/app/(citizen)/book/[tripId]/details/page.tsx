import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RequireAuth } from "../../../../../components/require-auth";
import { DetailsStep } from "./details-step";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("book.details.heading") };
}

/** docs/11 /book/[tripId]/details: one card per seat. Continue creates the booking and the hold. */
export default async function BookDetailsPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return (
    <RequireAuth>
      <DetailsStep tripId={tripId} />
    </RequireAuth>
  );
}
