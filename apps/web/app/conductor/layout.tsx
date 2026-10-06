import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { FieldShell } from "../../components/field-shell";
import { ConductorCounts } from "../../components/conductor-counts";
import { RequirePermission } from "../../components/require-auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  const app = t("common.appName");
  return { title: { absolute: `${t("shell.conductor")} · ${app}`, template: `%s · ${app}` } };
}

export default async function ConductorLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations();

  const counts = <ConductorCounts />;

  return (
    <div className="[&_button]:min-h-14 [&_button]:min-w-14 [&_a]:min-h-14">
      <FieldShell title={t("shell.conductor")} homeHref="/conductor" status={counts}>
        <RequirePermission anyOf={["ticket:validate"]}>{children}</RequirePermission>
      </FieldShell>
    </div>
  );
}
