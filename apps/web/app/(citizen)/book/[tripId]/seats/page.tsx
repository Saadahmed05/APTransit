import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RequireAuth } from "../../../../../components/require-auth";
import { SeatsStep } from "./seats-step";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("book.steps.seats") };
}

/** D-048 /book/[tripId]/seats: reserved trips only, one seat per traveller. */
export default async function BookSeatsPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return (
    <RequireAuth>
      <SeatsStep tripId={tripId} />
    </RequireAuth>
  );
}
