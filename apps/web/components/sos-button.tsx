"use client";

import { IncidentDto } from "@aptransit/shared";
import { Button } from "@aptransit/ui";
import { useMutation } from "@tanstack/react-query";
import { CircleCheck, Siren } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { api, errorKey } from "../lib/api";

/**
 * D-048: SOS for the conductor app. One press asks "Send SOS?" and a second press sends it, so a
 * pocket press never raises an alarm. The server fills trip, bus and location and marks it CRITICAL.
 */
export function SosButton() {
  const t = useTranslations("conductorApp.sos");
  const root = useTranslations();
  const [asking, setAsking] = useState(false);
  const send = useMutation({
    mutationFn: () => api("/conductor/sos", { method: "POST", schema: IncidentDto }),
    onSettled: () => setAsking(false),
  });

  if (send.data) {
    return (
      <p role="status" className="flex items-center gap-3 rounded-lg bg-status-success-soft p-4 text-body-lg text-fg">
        <CircleCheck className="size-6 shrink-0 text-status-success" aria-hidden="true" />
        {t("sent", { code: send.data.code })}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {asking ? (
        <div role="alertdialog" aria-labelledby="sos-question" className="flex flex-col gap-3 rounded-lg border-2 border-status-danger bg-status-danger-soft p-4">
          <p id="sos-question" className="text-h3 text-fg">
            {t("question")}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Button size="xl" variant="danger" className="h-14 min-h-14" loading={send.isPending} onClick={() => send.mutate()}>
              {t("confirm")}
            </Button>
            <Button size="xl" variant="secondary" className="h-14 min-h-14" onClick={() => setAsking(false)}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <Button size="xl" variant="danger" className="h-14 min-h-14" leftIcon={<Siren className="size-6" aria-hidden="true" />} onClick={() => setAsking(true)}>
          {t("button")}
        </Button>
      )}
      {send.error ? (
        <p role="alert" className="text-body-lg text-status-danger">
          {root(errorKey(send.error, (k) => root.has(k)))}
        </p>
      ) : null}
    </div>
  );
}
