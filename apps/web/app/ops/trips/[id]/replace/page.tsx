import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Skeleton } from "@aptransit/ui";
import ReplaceBusClient from "./replace-bus-client";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("opsApp");
  return { title: `${t("replaceBus")} · ${id}` };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <ReplaceBusClient id={id} />
    </Suspense>
  );
}
