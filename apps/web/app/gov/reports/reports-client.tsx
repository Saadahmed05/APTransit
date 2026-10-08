"use client";
import type { ReportKind } from "@aptransit/shared";
import { Button, toast } from "@aptransit/ui";
import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { apiBlob, errorKey } from "../../../lib/api";
import { istDate } from "../../../lib/gov";
import { inputClass } from "../../ops/ops-common";

/** Plan sec 72: which reports belong to each cadence, and the default range for it. */
const CARDS: Array<{ id: "daily" | "weekly" | "monthly"; days: number; kinds: ReportKind[] }> = [
  { id: "daily", days: 1, kinds: ["daily-operations", "tickets"] },
  { id: "weekly", days: 7, kinds: ["route-performance", "complaints"] },
  { id: "monthly", days: 30, kinds: ["route-performance", "daily-operations"] },
];

export function ReportsClient() {
  const t = useTranslations("govApp.reports");
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <h1 className="text-h1">{t("title")}</h1>
      <p className="text-muted">{t("intro")}</p>
      <div className="grid gap-4 lg:grid-cols-3">
        {CARDS.map((card) => (
          <ReportCard key={card.id} {...card} />
        ))}
      </div>
    </div>
  );
}

function ReportCard({ id, days, kinds }: (typeof CARDS)[number]) {
  const t = useTranslations("govApp.reports"),
    all = useTranslations();
  const [kind, setKind] = useState<ReportKind>(kinds[0]!);
  const [from, setFrom] = useState(istDate(-days));
  const [to, setTo] = useState(istDate(-1));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const { blob, fileName } = await apiBlob(`/reports/${kind}.csv`, { query: { from, to } });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName ?? `${kind}-${from}-to-${to}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(t("downloaded", { kind: t(`kinds.${kind}`) }));
    } catch (err) {
      setError(all(errorKey(err, (k) => all.has(k))));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby={`report-${id}`} className="flex flex-col gap-4 rounded-lg border border-default bg-surface p-4">
      <div>
        <h2 id={`report-${id}`} className="text-h2">
          {t(`cards.${id}.title`)}
        </h2>
        <p className="text-small text-muted">{t(`cards.${id}.hint`)}</p>
      </div>
      <label className="flex flex-col gap-1 text-small">
        <span>{t("kind")}</span>
        <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as ReportKind)}>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {t(`kinds.${k}`)}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-small">
          <span>{t("from")}</span>
          <input type="date" className={inputClass} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-small">
          <span>{t("to")}</span>
          <input type="date" className={inputClass} value={to} min={from} max={istDate()} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-small text-status-danger">
          {error}
        </p>
      )}
      <Button onClick={() => void download()} disabled={busy || !from || !to} aria-busy={busy}>
        <Download className="size-5" aria-hidden="true" />
        {busy ? t("preparing") : t("download")}
      </Button>
    </section>
  );
}
