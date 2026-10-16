import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WelcomeForm } from "./welcome-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("welcome.title") };
}

/** D-048: first sign in. A citizen adds a name, a verified email and a phone, then goes on to `next`. */
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams;
  return <WelcomeForm next={typeof next === "string" ? next : null} />;
}
