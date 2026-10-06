import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Skeleton } from "@aptransit/ui";
import StaffClient from "./staff-client";

export async function generateMetadata() {
  const t = await getTranslations("opsApp");
  return { title: t("staffAndDevices") };
}

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <StaffClient />
    </Suspense>
  );
}
