"use client";

import { Stepper } from "@aptransit/ui";
import { useTranslations } from "next-intl";

const STEPS = ["seat", "details", "pay"] as const;

/** The three booking steps (docs/11): Seat, Details, Pay. */
export function BookingStepper({ current }: { current: 0 | 1 | 2 }) {
  const t = useTranslations("book.steps");
  const steps = STEPS.map((step) => t(step));
  return (
    <Stepper
      steps={steps}
      current={current}
      label={t("label")}
      completedLabel={t("completed")}
      announcement={t("announce", {
        step: current + 1,
        total: steps.length,
        name: steps[current] ?? "",
      })}
    />
  );
}
