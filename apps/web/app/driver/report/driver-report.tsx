"use client";

import { type DriverIncidentInput, IncidentDto } from "@aptransit/shared";
import { Button, Card, Field, Textarea } from "@aptransit/ui";
import { useMutation } from "@tanstack/react-query";
import { Ambulance, Ban, BellRing, CarFront, CircleCheck, CircleEllipsis, Construction, Timer, TrafficCone, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { api, errorKey } from "../../../lib/api";
import { useDriverToday } from "../../../lib/driver-today";

const TILES = [
  { type: "DELAY", icon: Timer },
  { type: "TRAFFIC", icon: TrafficCone },
  { type: "BREAKDOWN", icon: Wrench },
  { type: "ACCIDENT", icon: CarFront },
  { type: "ROAD_BLOCK", icon: Construction },
  { type: "MEDICAL", icon: Ambulance },
  { type: "OTHER", icon: CircleEllipsis },
] as const satisfies readonly { type: DriverIncidentInput["type"]; icon: unknown }[];

export function DriverReport() {
  const t = useTranslations("driverApp");
  const tRoot = useTranslations();
  const today = useDriverToday();
  const [type, setType] = useState<DriverIncidentInput["type"] | null>(null);
  const [note, setNote] = useState("");
  const [missingType, setMissingType] = useState(false);

  const report = useMutation({
    mutationFn: (body: DriverIncidentInput) => api("/driver/incidents", { method: "POST", body, schema: IncidentDto }),
  });

  const tripHref = today.data?.trip ? `/driver/trip/${today.data.trip.id}` : "/driver";

  if (report.data) {
    return (
      <div className="flex flex-col gap-5" role="status">
        <CircleCheck className="size-14 text-status-success" aria-hidden="true" />
        <h1 className="text-h1 text-fg">{t("report.sentTitle")}</h1>
        <p className="text-body-lg text-muted">{t("report.sentHint", { code: report.data.code })}</p>
        <Button asChild size="xl">
          <Link href={tripHref}>{t("report.backToTrip")}</Link>
        </Button>
      </div>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!type) {
      setMissingType(true);
      return;
    }
    report.mutate({ type, ...(note.trim() ? { note: note.trim().slice(0, 280) } : {}) });
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <h1 className="text-h1 text-fg">{t("report.title")}</h1>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-h3 text-fg">{t("report.pickType")}</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {TILES.map(({ type: value, icon: Icon }) => (
            <button
              key={value}
              type="button"
              aria-pressed={type === value}
              onClick={() => {
                setType(value);
                setMissingType(false);
              }}
              className={
                type === value
                  ? "flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg border-2 border-primary bg-primary-soft p-3 text-body-lg font-medium text-fg"
                  : "flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg border border-strong bg-surface-raised p-3 text-body-lg font-medium text-fg transition-colors duration-fast hover:border-primary"
              }
            >
              <Icon className="size-8" aria-hidden="true" />
              {t(`report.types.${value}`)}
            </button>
          ))}
        </div>
        {missingType && (
          <p role="alert" className="flex items-center gap-2 text-body-lg text-status-danger">
            <Ban className="size-5" aria-hidden="true" />
            {t("report.pickFirst")}
          </p>
        )}
      </fieldset>

      <Card padding="md">
        <Field id="incident-note" label={t("report.noteLabel")} hint={t("report.noteHint")}>
          <Textarea id="incident-note" value={note} maxLength={280} rows={3} onChange={(e) => setNote(e.target.value)} className="text-body-lg" />
        </Field>
      </Card>

      {report.error && (
        <p role="alert" className="text-body-lg text-status-danger">
          {tRoot(errorKey(report.error, (k) => tRoot.has(k)))}
        </p>
      )}
      <Button type="submit" size="xl" loading={report.isPending} leftIcon={<BellRing className="size-5" aria-hidden="true" />}>
        {t("report.send")}
      </Button>
    </form>
  );
}
