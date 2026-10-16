import { cn } from "@aptransit/ui";

/** The AP TransitOS mark: a front facing bus on a primary tile. Decorative, the app name sits next to it. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={cn("size-9 shrink-0", className)}>
      <rect width="24" height="24" rx="6" className="fill-primary" />
      <rect x="6" y="5" width="12" height="13" rx="2.5" className="fill-on-primary" />
      <rect x="7.5" y="6.5" width="9" height="5" rx="1" className="fill-primary" />
      <circle cx="9.5" cy="14.5" r="1" className="fill-primary" />
      <circle cx="14.5" cy="14.5" r="1" className="fill-primary" />
      <rect x="7" y="18" width="3" height="2.5" rx="0.8" className="fill-on-primary" />
      <rect x="14" y="18" width="3" height="2.5" rx="0.8" className="fill-on-primary" />
    </svg>
  );
}

/** Logo and app name for headers. */
export function BrandLogo({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <BrandMark />
      <span className="truncate text-h3 text-primary">{name}</span>
    </span>
  );
}
