import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { FeedbackForm } from "./feedback-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("feedbackPage");
  return { title: t("title") };
}

/** docs/11 /feedback (public). ?ticket=APT-XXXX-XXXX prefills the ticket from a completed ticket. */
export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ ticket?: string }> }) {
  const t = await getTranslations("feedbackPage");
  const { ticket } = await searchParams;
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-gutter py-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1">{t("title")}</h1>
        <p className="text-muted">{t("intro")}</p>
        <Link href="/feedback/status" className="inline-flex min-h-11 items-center self-start text-primary underline-offset-4 hover:underline">
          {t("haveCode")}
        </Link>
      </div>
      <FeedbackForm ticketCode={typeof ticket === "string" ? ticket.slice(0, 20) : undefined} />
    </div>
  );
}
