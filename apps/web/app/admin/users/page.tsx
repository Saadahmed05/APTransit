import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Skeleton } from "@aptransit/ui";
import UsersClient from "./users-client";

export async function generateMetadata() {
  const t = await getTranslations("adminApp");
  return { title: t("usersTitle") };
}

export default function UsersPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <UsersClient />
    </Suspense>
  );
}
