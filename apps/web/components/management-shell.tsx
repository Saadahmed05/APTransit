import { ChevronDown, type LucideIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense, type ReactNode } from "react";
import { AccountMenu } from "./account-menu";
import { LanguageSwitch } from "./language-switch";
import { ManagementSidebar, type NavItem } from "./management-sidebar";
import { SkipLink } from "./skip-link";
import { ThemeSwitch } from "./theme-switch";

export interface ManagementShellProps {
  title: string;
  baseHref: string;
  items: NavItem[];
  /** Depot or district switcher placeholder (real switcher once the session knows the scopes). */
  scope?: { icon: LucideIcon; label: string; value: string };
  scopeControl?: ReactNode;
  children: ReactNode;
}

/** Ops, gov and admin shell (docs/09 Layout): sidebar, top bar with scope and account, content. */
export async function ManagementShell({ title, baseHref, items, scope, scopeControl, children }: ManagementShellProps) {
  const t = await getTranslations("nav");
  const ScopeIcon = scope?.icon;

  return (
    <div className="flex min-h-screen bg-bg text-fg">
      <SkipLink label={t("skipToContent")} />
      <Suspense><ManagementSidebar title={title} baseHref={baseHref} items={items} /></Suspense>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-header flex h-16 items-center justify-between gap-4 border-b border-default bg-surface-raised px-gutter">
          <div className="flex min-w-0 flex-1">
            {scopeControl ?? (scope && ScopeIcon ? (
              <div className="flex min-h-11 min-w-0 max-w-full items-center gap-2 rounded-md border border-default bg-surface px-3 text-small">
                <ScopeIcon className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="truncate">
                  <span className="text-muted max-sm:sr-only">{scope.label}: </span>
                  <span className="font-semibold">{scope.value}</span>
                </span>
                <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden="true" />
              </div>
            ) : (
              <span className="truncate text-h3 text-fg md:hidden">{title}</span>
            ))}
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
          className="mx-auto w-full max-w-7xl flex-1 px-gutter py-6 outline-none lg:py-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
