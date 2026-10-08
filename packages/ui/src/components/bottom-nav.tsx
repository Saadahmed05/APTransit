import * as React from "react";
import { cn } from "../cn";

export interface BottomNavItem {
  /** Stable key, also used for test ids. */
  id: string;
  href: string;
  /** Visible label, already translated. Always shown next to the icon. */
  label: string;
  icon: React.ReactNode;
  active?: boolean;
}

export interface BottomNavProps extends React.HTMLAttributes<HTMLElement> {
  items: BottomNavItem[];
  /** Accessible name of the navigation landmark, already translated. */
  label: string;
  /** Link component, for example next/link. Defaults to a plain anchor. */
  linkAs?: React.ElementType;
}

/**
 * Bottom navigation for the field apps (docs/09, Bottom nav): at most 4 items, 56 px targets,
 * icon plus label, the current page marked with aria-current and a 3 px pill above the icon.
 * The caller positions it (the shell makes it sticky); this only renders.
 */
export const BottomNav = React.forwardRef<HTMLElement, BottomNavProps>(
  ({ items, label, linkAs: LinkComponent = "a", className, ...props }, ref) => (
    <nav
      ref={ref}
      aria-label={label}
      className={cn(
        "border-t border-default bg-surface-raised pb-[env(safe-area-inset-bottom)]",
        className,
      )}
      {...props}
    >
      <ul className="mx-auto flex max-w-xl items-stretch justify-around">
        {items.slice(0, 4).map((item) => (
          <li key={item.id} className="flex-1">
            <LinkComponent
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              data-testid={`bottom-nav-${item.id}`}
              className={cn(
                "press-scale relative flex min-h-16 min-w-14 flex-col items-center justify-center gap-1 px-2 text-caption font-medium transition-colors duration-fast",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                item.active ? "text-primary" : "text-muted hover:text-fg",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-1 h-0.75 w-8 rounded-full bg-primary transition-opacity duration-fast",
                  item.active ? "opacity-100" : "opacity-0",
                )}
              />
              <span className="inline-flex size-6 items-center justify-center" aria-hidden="true">
                {item.icon}
              </span>
              <span className="max-w-full truncate">{item.label}</span>
            </LinkComponent>
          </li>
        ))}
      </ul>
    </nav>
  ),
);
BottomNav.displayName = "BottomNav";
