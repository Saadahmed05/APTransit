import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RequireAuth } from "../../../../../components/require-auth";
import { ReviewStep } from "./review-step";

interface BookReviewPageProps {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ booking?: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("book.review.heading") };
}

/** docs/11 /book/[tripId]/review: hold timer, summary, fare, refund tiers, Pay. Reload safe (?booking=). */
export default async function BookReviewPage({ params, searchParams }: BookReviewPageProps) {
  const { tripId } = await params;
  const { booking } = await searchParams;
  return (
    <RequireAuth>
      <ReviewStep tripId={tripId} bookingId={booking} />
    </RequireAuth>
  );
}
