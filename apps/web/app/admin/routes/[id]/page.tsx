import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Skeleton } from "@aptransit/ui";
import RouteEditorClient from "./route-editor-client";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("adminApp");
  return { title: `${t("editRouteTitle")} ${id}` };
}

export default async function RouteEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <RouteEditorClient id={id} />
    </Suspense>
  );
}
