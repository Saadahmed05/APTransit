import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RequireAuth } from "../../../../components/require-auth";
import { SchoolPassView } from "./school-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("schoolPass.title") };
}

/** D-036 /passes/school: student check, home and school stops, then pay. Cloned from /free-travel. */
export default function SchoolPassPage() {
  return (
    <RequireAuth>
      <SchoolPassView />
    </RequireAuth>
  );
}
