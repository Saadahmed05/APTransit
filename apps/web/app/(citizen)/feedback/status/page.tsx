import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FeedbackStatus } from "./feedback-status";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("feedbackPage");
  return { title: t("statusTitle") };
}

/** docs/11 /feedback/status (public): code and email lookup. */
export default async function FeedbackStatusPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const t = await getTranslations("feedbackPage");
  const { code } = await searchParams;
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-gutter py-6">
      <h1 className="text-h1">{t("statusTitle")}</h1>
      <FeedbackStatus initialCode={typeof code === "string" ? code.slice(0, 20) : ""} />
    </div>
  );
}
