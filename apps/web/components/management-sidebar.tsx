"use client";

import { can, type Permission } from "@aptransit/shared";
import { cn } from "@aptransit/ui";
import { Bus } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useMe } from "./auth-provider";

export interface NavItem {
  href: string;
  label: string;
  /** A rendered icon element (<Bus />). Component functions cannot cross the server to client boundary. */
  icon: ReactNode;
  /** Shown only to roles holding this permission (hiding is a UX nicety; the API checks again). */
  permission?: Permission;
}

export interface ManagementSidebarProps {
  /** Surface name, also the accessible name of the menu. */
  title: string;
  baseHref: string;
  items: NavItem[];
}

/** docs/09: icons only (collapsed) at md, fixed 248 px with labels at lg. Desktop first shells. */
export function ManagementSidebar({ title, baseHref, items }: ManagementSidebarProps) {
  const pathname = usePathname(), depot = useSearchParams().get("depot");
  const roles = useMe().data?.roles.map((r) => r.role) ?? [];
  const scopedHref = (href: string) => href.startsWith("/ops") && depot ? href + "?depot=" + encodeURIComponent(depot) : href;

  return (
    <aside className="hidden w-18 shrink-0 flex-col border-r border-default bg-surface-raised md:flex lg:w-62">
      <div className="flex h-16 items-center border-b border-default px-4">
        <Link
          href={scopedHref(baseHref)}
          className="inline-flex min-h-11 min-w-0 items-center gap-2 text-h3 text-primary max-lg:mx-auto"
        >
          <Bus className="size-6 shrink-0" aria-hidden="true" />
          <span className="truncate max-lg:sr-only">{title}</span>
        </Link>
      </div>

      <nav aria-label={title} className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        {items.filter((item) => !item.permission || can(roles, item.permission)).map((item) => {
          const active =
            item.href === baseHref
              ? pathname === baseHref
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={scopedHref(item.href)}
              aria-current={active ? "page" : undefined}
              title={item.label}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-md px-3 text-small font-medium transition-colors duration-fast max-lg:justify-center",
                active ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface hover:text-fg",
              )}
            >
              <span className="inline-flex shrink-0 [&>svg]:size-5" aria-hidden="true">
                {item.icon}
              </span>
              <span className="truncate max-lg:sr-only">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
