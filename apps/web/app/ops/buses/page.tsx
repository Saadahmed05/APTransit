import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Skeleton } from "@aptransit/ui";
import Client from "./buses-client";
export async function generateMetadata() {
  const t = await getTranslations("opsApp");
  return { title: t("buses") };
}
export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-48 w-full" />}>
      <Client />
    </Suspense>
  );
}
