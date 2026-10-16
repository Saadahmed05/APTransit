import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { AccountMenu } from "./account-menu";
import { BrandMark } from "./brand-logo";
import { LanguageSwitch } from "./language-switch";
import { SkipLink } from "./skip-link";
import { ThemeSwitch } from "./theme-switch";

export interface FieldShellProps {
  /** Surface name shown in the slim top bar ("Driver", "Conductor"). */
  title: string;
  homeHref: string;
  /** Extra top bar content, for example the conductor trip counts. */
  status?: ReactNode;
  children: ReactNode;
}

/** Driver and conductor shell (docs/09): no nav, full screen, large type, slim top bar. */
export async function FieldShell({ title, homeHref, status, children }: FieldShellProps) {
  const t = await getTranslations("nav");

  return (
    <div className="flex min-h-screen flex-col bg-bg text-body-lg text-fg">
      <SkipLink label={t("skipToContent")} />

      <header className="sticky top-0 z-header flex h-16 items-center justify-between gap-2 border-b border-default bg-surface-raised px-gutter">
        <div className="flex min-w-0 items-center gap-4">
          <Link href={homeHref} className="inline-flex min-h-11 min-w-0 items-center gap-2 text-h3 text-primary">
            <BrandMark />
            <span className="truncate">{title}</span>
          </Link>
          {status}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <LanguageSwitch />
          <ThemeSwitch />
          <AccountMenu title={title} />
        </div>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-3xl flex-1 px-gutter py-6 outline-none"
      >
        {children}
      </main>
    </div>
  );
}
