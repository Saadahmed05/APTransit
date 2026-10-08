import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { MinimalShowcase } from "../_token-check/minimal-showcase";
import { PrimitivesShowcase } from "../_token-check/primitives-showcase";
import { TokenCheck } from "../_token-check/token-check";

// Development only gallery (docs/09). Production builds answer 404.
export default async function DesignPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }
  const t = await getTranslations("design");

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-12 px-gutter py-6">
      <div className="border-b border-default pb-4">
        <h1 className="text-display text-fg">{t("title")}</h1>
        <p className="mt-2 text-body text-muted">{t("description")}</p>
      </div>

      <PrimitivesShowcase />
      <MinimalShowcase />
      <div className="border-t border-default pt-12">
        <h2 className="mb-6 text-h1 text-fg">{t("tokens")}</h2>
        <TokenCheck />
      </div>
    </main>
  );
}
