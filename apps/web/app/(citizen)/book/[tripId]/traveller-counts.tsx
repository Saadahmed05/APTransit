"use client";

import {
  BOOKING_MAX_PASSENGERS,
  categoryFarePaise,
  CHILD_MAX_AGE,
  formatMoney,
  type PassengerCategory,
  SENIOR_MIN_AGE,
} from "@aptransit/shared";
import { Card, IconButton } from "@aptransit/ui";
import { Minus, Plus, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { TravellerCounts as Counts } from "../../../../lib/booking-draft";
import { travellerTotal } from "../../../../lib/booking-draft";

const ROWS: { category: PassengerCategory; hint: "adultHint" | "childHint" | "seniorHint" }[] = [
  { category: "ADULT", hint: "adultHint" },
  { category: "CHILD", hint: "childHint" },
  { category: "SENIOR", hint: "seniorHint" },
];

/**
 * D-048: Adult, Child and Senior counts with plus and minus buttons and the price of each. The
 * server prices the booking again; these numbers are only a preview.
 */
export function TravellerCounts({
  counts,
  onChange,
  adultTotalPaise,
}: {
  counts: Counts;
  onChange: (next: Counts) => void;
  /** One adult ticket (fare and reservation fee) for the chosen stops, when known. */
  adultTotalPaise?: number;
}) {
  const t = useTranslations("book.travellers");
  const locale = useLocale();
  const total = travellerTotal(counts);
  const full = total >= BOOKING_MAX_PASSENGERS;

  return (
    <Card padding="md" className="flex flex-col gap-4" data-testid="traveller-counts">
      <h2 className="flex items-center gap-2 text-h3 text-fg">
        <Users className="size-5" aria-hidden="true" />
        {t("heading")}
      </h2>
      <p className="text-small text-muted">{t("intro")}</p>
      <ul className="flex flex-col divide-y divide-hairline">
        {ROWS.map(({ category, hint }) => {
          const label = t(category);
          const count = counts[category];
          return (
            <li key={category} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-body font-medium text-fg">{label}</p>
                <p className="text-small text-muted">
                  {t(hint, { child: CHILD_MAX_AGE, lastAdult: SENIOR_MIN_AGE - 1, senior: SENIOR_MIN_AGE })}
                  {adultTotalPaise !== undefined && (
                    <>
                      {" · "}
                      <span className="tabular-nums">
                        {t("each", { price: formatMoney(categoryFarePaise(adultTotalPaise, category), locale) })}
                      </span>
                    </>
                  )}
                </p>
              </div>
              <IconButton
                variant="secondary"
                aria-label={t("remove", { category: label })}
                disabled={count === 0}
                onClick={() => onChange({ ...counts, [category]: count - 1 })}
              >
                <Minus className="size-5" aria-hidden="true" />
              </IconButton>
              <output
                className="w-8 text-center text-h3 tabular-nums text-fg"
                aria-live="polite"
                aria-label={t("count", { category: label, count })}
              >
                {count}
              </output>
              <IconButton
                variant="secondary"
                aria-label={t("add", { category: label })}
                disabled={full}
                onClick={() => onChange({ ...counts, [category]: count + 1 })}
              >
                <Plus className="size-5" aria-hidden="true" />
              </IconButton>
            </li>
          );
        })}
      </ul>
      {full && (
        <p className="text-small text-muted" role="status">
          {t("max", { max: BOOKING_MAX_PASSENGERS })}
        </p>
      )}
      {total === 0 && (
        <p className="text-small text-status-warning" role="status">
          {t("none")}
        </p>
      )}
      {(counts.CHILD > 0 || counts.SENIOR > 0) && <p className="text-small text-muted">{t("proof")}</p>}
    </Card>
  );
}
