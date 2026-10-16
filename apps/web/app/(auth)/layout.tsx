import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "../../components/brand-logo";
import { LanguageSwitch } from "../../components/language-switch";
import { SkipLink } from "../../components/skip-link";
import { ThemeSwitch } from "../../components/theme-switch";

/** Slim shell for login: app name, language and theme. No navigation to get lost in. */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations();

  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg">
      <SkipLink label={t("nav.skipToContent")} />
      <header className="sticky top-0 z-header border-b border-default bg-surface-raised">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-2 px-gutter">
          <Link href="/" className="inline-flex min-h-11 min-w-0 items-center">
            <BrandLogo name={t("common.appName")} />
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            <LanguageSwitch />
            <ThemeSwitch />
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-md flex-1 px-gutter py-8 outline-none">
        {children}
      </main>
    </div>
  );
}
