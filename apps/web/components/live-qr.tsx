"use client";

import { colourOfDay, formatClock, qrStep } from "@aptransit/shared";
import { cn, Skeleton } from "@aptransit/ui";
import { SunMedium } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { qrContentAt } from "../lib/qr-code";
import { useNow } from "../lib/use-browser-state";
import { QrSvg } from "./qr-svg";

export interface LiveQrData {
  token: string;
  rotSecret: string;
  periodSec: number;
  /** serverTime minus the device clock, measured once when the QR was fetched. */
  serverOffsetMs: number;
}

/** Tailwind classes per colour of the day (raw values live in tokens.css). */
const DAY_BAND: Record<string, string> = {
  "--day-mon": "bg-day-mon",
  "--day-tue": "bg-day-tue",
  "--day-wed": "bg-day-wed",
  "--day-thu": "bg-day-thu",
  "--day-fri": "bg-day-fri",
  "--day-sat": "bg-day-sat",
  "--day-sun": "bg-day-sun",
};

/**
 * The live ticket QR (docs/07 section 4): the code changes every period from rotSecret with Web
 * Crypto, a live clock with seconds, the colour of the day as a band with its name, and a slow band
 * animation that stops under reduced motion (the clock and colour stay). Works offline: it only
 * needs the cached token, secret and offset.
 */
export function LiveQr({ data, label }: { data: LiveQrData; label: string }) {
  const t = useTranslations("ticketDetail.qr");
  const tRoot = useTranslations();
  const locale = useLocale();
  const now = useNow(1_000);
  const step = now ? qrStep(now, data.serverOffsetMs, data.periodSec) : null;
  const [content, setContent] = useState<{ step: number; value: string } | null>(null);

  useEffect(() => {
    if (step === null) return;
    let alive = true;
    void qrContentAt(data.token, data.rotSecret, step * data.periodSec * 1000, 0, data.periodSec).then((value) => {
      if (alive) setContent({ step, value });
    });
    return () => {
      alive = false;
    };
  }, [step, data.token, data.rotSecret, data.periodSec]);

  const serverNow = now ? now + data.serverOffsetMs : null;
  const colour = serverNow ? colourOfDay(new Date(serverNow)) : null;

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="rounded-lg bg-qr-paper p-2">
        {content ? <QrSvg value={content.value} label={label} /> : <Skeleton className="size-64 rounded-md" />}
      </div>

      <p className="text-display tabular-nums text-fg" aria-live="off">
        {serverNow ? formatClock(serverNow, locale) : ""}
      </p>

      {colour ? (
        <div className="flex w-full flex-col gap-2">
          <div className={cn("relative h-4 w-full overflow-hidden rounded-full", DAY_BAND[colour.cssVar])} aria-hidden="true">
            <span className="animate-ticket-band absolute inset-y-0 left-0 w-1/2 bg-linear-to-r from-transparent via-on-solid/40 to-transparent" />
          </div>
          <p className="text-center text-body font-medium text-fg">{t("colourOfDay", { colour: tRoot(colour.i18nKey) })}</p>
        </div>
      ) : (
        <Skeleton className="h-4 w-full rounded-full" />
      )}

      <p className="flex items-center gap-2 text-small text-muted">
        <SunMedium className="size-4 shrink-0" aria-hidden="true" />
        {t("brightness")}
      </p>
    </div>
  );
}
