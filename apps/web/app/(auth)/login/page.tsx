import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("auth.login") };
}

/** docs/11 Citizen "/login": email or phone, OTP, then back to `next` or the role home (docs/08). */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[]; email?: string | string[] }> }) {
  const { next, email } = await searchParams;
  return <LoginForm next={typeof next === "string" ? next : null} initialEmail={typeof email === "string" ? email : null} />;
}
