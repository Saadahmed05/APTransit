import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { OpsScopeSwitcher } from "../../components/ops-scope-switcher";
import type { ReactNode } from "react";
import { AlertOctagon, Bus, Calendar, LayoutDashboard, MessageSquare, Users } from "lucide-react";
import { ManagementShell } from "../../components/management-shell";
import { RequirePermission } from "../../components/require-auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  const app = t("common.appName");
  return { title: { absolute: `${t("shell.ops")} · ${app}`, template: `%s · ${app}` } };
}

export default async function OpsLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations();

  const navItems = [
    { href: "/ops", label: t("nav.dashboard"), icon: <LayoutDashboard /> },
    { href: "/ops/buses", label: t("nav.buses"), icon: <Bus /> },
    { href: "/ops/trips", label: t("nav.trips"), icon: <Calendar /> },
    { href: "/ops/incidents", label: t("nav.incidents"), icon: <AlertOctagon /> },
    { href: "/ops/staff", label: t("nav.staff"), icon: <Users /> },
    { href: "/ops/complaints", label: t("nav.complaints"), icon: <MessageSquare /> },
  ];

  return (
    <ManagementShell
      title={t("shell.ops")}
      baseHref="/ops"
      items={navItems}
      scopeControl={
        <Suspense>
          <OpsScopeSwitcher />
        </Suspense>
      }
    >
      <RequirePermission anyOf={["ops:read"]}>{children}</RequirePermission>
    </ManagementShell>
  );
}
