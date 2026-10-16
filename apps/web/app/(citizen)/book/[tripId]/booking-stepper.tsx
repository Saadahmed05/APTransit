"use client";

import { Stepper } from "@aptransit/ui";
import { useTranslations } from "next-intl";

type Step = "travellers" | "seats" | "pay";

/** D-048 booking steps: Travellers, Seats, Pay on reserved trips; Travellers, Pay on local trips. */
export function BookingStepper({ current, seatless }: { current: Step; seatless: boolean }) {
  const t = useTranslations("book.steps");
  const ids: Step[] = seatless ? ["travellers", "pay"] : ["travellers", "seats", "pay"];
  const steps = ids.map((step) => t(step));
  const index = Math.max(0, ids.indexOf(current));
  return (
    <Stepper
      steps={steps}
      current={index}
      label={t("label")}
      completedLabel={t("completed")}
      announcement={t("announce", { step: index + 1, total: steps.length, name: steps[index] ?? "" })}
    />
  );
}
