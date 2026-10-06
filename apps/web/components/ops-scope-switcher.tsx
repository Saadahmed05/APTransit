"use client";
import { useLocale, useTranslations } from "next-intl";
import { useMe } from "./auth-provider";
import { useOpsDepots, useOpsFilters } from "../lib/ops";
import { Button } from "@aptransit/ui";
export function OpsScopeSwitcher() {
  const t = useTranslations("opsApp"),
    common = useTranslations("common"),
    locale = useLocale(),
    me = useMe(),
    depots = useOpsDepots(),
    { depotId, set } = useOpsFilters();
  if (
    !me.data?.roles.some((r) =>
      ["DISTRICT_OFFICER", "TRANSPORT_OFFICER", "STATE_ADMIN", "SUPER_ADMIN"].includes(r.role),
    )
  )
    return null;
  if (depots.isError) return <Button variant="secondary" onClick={() => void depots.refetch()}>{common("retry")}</Button>;
  return (
    <label className="flex min-w-0 items-center gap-2 text-small">
      <span className="max-sm:sr-only">{t("depot")}</span>
      <select
        className="min-h-11 min-w-0 max-w-full rounded-md border border-default bg-surface px-3"
        aria-label={t("depot")}
        value={depotId ?? ""}
        onChange={(e) => set("depot", e.target.value)}
        disabled={depots.isPending}
      >
        <option value="">{t("allDepots")}</option>
        {depots.data?.map((d) => (
          <option key={d.id} value={d.id}>
            {locale === "te" ? d.nameTe : d.nameEn}
          </option>
        ))}
      </select>
    </label>
  );
}
