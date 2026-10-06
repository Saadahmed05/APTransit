"use client";
import { useTranslations } from "next-intl";
import { useConductorToday } from "../lib/conductor-today";
export function ConductorCounts({ large = false }: { large?: boolean }) {
  const t = useTranslations("conductorApp"),
    query = useConductorToday();
  return (
    <dl
      aria-label={t("counts")}
      className={large ? "grid grid-cols-3 gap-3" : "hidden gap-4 text-small md:flex"}
    >
      {(["passengers", "checked", "pending"] as const).map((key) => (
        <div
          key={key}
          className={
            large
              ? "min-w-0 rounded-lg border border-default bg-surface-raised p-3 text-center"
              : ""
          }
        >
          <dt className="text-small text-muted">{t(key)}</dt>
          <dd className={large ? "text-display tabular-nums" : "font-semibold tabular-nums"}>
            {query.data?.counts[key] ?? 0}
          </dd>
        </div>
      ))}
    </dl>
  );
}
