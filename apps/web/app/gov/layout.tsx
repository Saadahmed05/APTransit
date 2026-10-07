import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Activity, BarChart3, FileText, Landmark, MessageSquare } from "lucide-react";
import { ManagementShell } from "../../components/management-shell";
import { RequirePermission } from "../../components/require-auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  const app = t("common.appName");
  return { title: { absolute: `${t("nav.commandCenter")} · ${app}`, template: `%s · ${app}` } };
}

export default async function GovLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations();

  const navItems = [
    { href: "/gov", label: t("nav.commandCenter"), icon: <Activity /> },
    { href: "/gov/analytics", label: t("nav.analytics"), icon: <BarChart3 /> },
    { href: "/gov/reports", label: t("nav.reports"), icon: <FileText /> },
    { href: "/ops/complaints", label: t("nav.complaints"), icon: <MessageSquare />, permission: "complaint:manage" as const },
  ];

  return (
    <ManagementShell
      title={t("nav.commandCenter")}
      baseHref="/gov"
      items={navItems}
      scope={{ icon: Landmark, label: t("common.scope"), value: t("common.state") }}
    >
      <RequirePermission anyOf={["gov:read"]}>{children}</RequirePermission>
    </ManagementShell>
  );
}
