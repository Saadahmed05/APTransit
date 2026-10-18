import { Megaphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { pickCreative } from "../lib/ads";

/**
 * D-052: an advertising space under the ticket and pass QR. It sits below the QR and the boarding
 * hints so it never covers the code the conductor scans, and it is always labelled as an ad.
 */
export function AdSlot({ seed }: { seed: string }) {
  const t = useTranslations("ads");
  const key = pickCreative(seed);
  return (
    <aside
      aria-label={t("label")}
      data-testid="ad-slot"
      className="flex w-full items-start gap-3 rounded-md border border-dashed border-strong bg-surface-sunken p-3"
    >
      <Megaphone className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-caption font-medium uppercase text-muted">{t("label")}</p>
        <p className="text-body font-semibold text-fg">{t(`creatives.${key}.title`)}</p>
        <p className="text-small text-muted">{t(`creatives.${key}.body`)}</p>
      </div>
    </aside>
  );
}
