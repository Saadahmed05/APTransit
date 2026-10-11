import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "../../../components/page-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("terms");
  return { title: t("title") };
}

const SECTIONS = [
  "tickets",
  "groups",
  "passes",
  "children",
  "qr",
  "refunds",
  "conduct",
  "privacy",
  "account",
] as const;

/** D-042: terms and conditions, public (linked from login and account). Plain language, both languages. */
export default async function TermsPage() {
  const t = await getTranslations("terms");
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader title={t("title")} description={t("updated")} />
      {SECTIONS.map((key) => (
        <section
          key={key}
          aria-labelledby={`terms-${key}`}
          className="flex flex-col gap-2 rounded-lg border border-default bg-surface-raised p-5"
        >
          <h2 id={`terms-${key}`} className="text-h3 text-fg">
            {t(`${key}.title`)}
          </h2>
          <p className="text-body text-muted">{t(`${key}.body`)}</p>
        </section>
      ))}
    </div>
  );
}
