import { redirect } from "next/navigation";

/** D-048: passenger details are no longer asked. Old links land on the travellers step. */
export default async function BookDetailsPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  redirect(`/book/${tripId}`);
}
