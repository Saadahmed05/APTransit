import { cn } from "@aptransit/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { User } from "lucide-react";
import { LanguageSwitch } from "../../components/language-switch";
import { NotificationBell } from "../../components/notification-bell";
import { SkipLink } from "../../components/skip-link";
import { ThemeSwitch } from "../../components/theme-switch";
import { CitizenBottomNav, CitizenTopNav } from "./citizen-nav";

const iconLink =
  "inline-flex size-11 items-center justify-center rounded-md text-muted transition-colors duration-fast hover:bg-surface hover:text-fg";

export default async function CitizenLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations();

  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg">
      <SkipLink label={t("nav.skipToContent")} />

      <header className="sticky top-0 z-header border-b border-default bg-surface-raised">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-2 px-gutter">
          <div className="flex min-w-0 items-center gap-6">
            <Link href="/" className="truncate text-h3 text-primary">
              {t("common.appName")}
            </Link>
            <CitizenTopNav />
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <LanguageSwitch />
            {/* Not in the docs/11 mobile top bar; phones get theme on the account page (Day 4). */}
            <div className="hidden md:block">
              <ThemeSwitch />
            </div>
            <NotificationBell className={iconLink} />
            <Link href="/account" aria-label={t("nav.account")} className={cn(iconLink, "hidden md:inline-flex")}>
              <User className="size-5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-5xl flex-1 px-gutter py-6 pb-24 outline-none md:pb-8"
      >
        {children}
      </main>

      <CitizenBottomNav />
    </div>
  );
}
