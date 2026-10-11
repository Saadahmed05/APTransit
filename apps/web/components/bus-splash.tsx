import { getTranslations } from "next-intl/server";

/**
 * D-042: the opening animation. A bus drives across a road, then the layer fades away by itself.
 * Pure CSS (server rendered), so it shows on the first paint without JavaScript and never blocks
 * clicks. Hidden from screen readers; reduced motion shortens it to a short fade.
 */
export async function BusSplash() {
  const t = await getTranslations("splash");
  return (
    <div
      aria-hidden="true"
      data-testid="bus-splash"
      className="animate-splash-out pointer-events-none fixed inset-0 z-toast flex flex-col items-center justify-center gap-8 bg-linear-to-b from-primary-soft to-surface-raised"
    >
      <div className="flex flex-col items-center gap-2 px-gutter text-center">
        <span className="text-display-lg text-primary">{t("brand")}</span>
        <span className="text-body-lg text-muted">{t("tagline")}</span>
      </div>
      <div className="relative w-full max-w-md overflow-hidden px-gutter">
        <svg viewBox="0 0 220 90" className="animate-bus-drive h-28 w-full" role="presentation">
          <rect x="20" y="14" width="170" height="50" rx="10" className="fill-primary" />
          <rect x="160" y="22" width="24" height="22" rx="4" className="fill-surface-raised" />
          {[30, 62, 94, 126].map((x) => (
            <rect
              key={x}
              x={x}
              y="22"
              width="26"
              height="18"
              rx="3"
              className="fill-surface-raised"
            />
          ))}
          <rect x="20" y="48" width="170" height="4" className="fill-primary-soft" />
          <rect x="182" y="52" width="8" height="6" rx="2" className="fill-status-warning" />
          {[55, 155].map((cx) => (
            <g key={cx} className="animate-wheel-spin">
              <circle cx={cx} cy="66" r="11" className="fill-fg" />
              <circle cx={cx} cy="66" r="4" className="fill-surface-raised" />
              <rect x={cx - 1} y="56" width="2" height="6" className="fill-surface-raised" />
            </g>
          ))}
        </svg>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="animate-road-slide flex h-full w-max gap-4">
            {Array.from({ length: 24 }, (_, i) => (
              <span key={i} className="h-full w-6 shrink-0 bg-surface-raised" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
