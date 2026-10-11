import { getTranslations } from "next-intl/server";
import { PassTypesClient } from "./pass-types-client";

export async function generateMetadata() {
  const t = await getTranslations("adminApp");
  return { title: t("passTypes.title") };
}

/** D-036 /admin/policies/pass-types: prices and rules for new sales (policy:write). */
export default function PassTypesPage() {
  return <PassTypesClient />;
}
