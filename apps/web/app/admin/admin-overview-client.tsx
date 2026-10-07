"use client";

import { AdminAuditPage, type AdminAuditDto, formatDate, formatTime } from "@aptransit/shared";
import { Card, DataTable, Skeleton } from "@aptransit/ui";
import { Clock, FileCheck, MapPin, Route, ScrollText, Shield, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useAdminQuery } from "../../lib/admin";
import { OpsEmpty, OpsError } from "../ops/ops-common";

export default function AdminOverviewClient() {
  const t = useTranslations("adminApp");
  const locale = useLocale();

  const {
    data: auditPage,
    isLoading,
    error,
    refetch,
  } = useAdminQuery("/admin/audit-logs", AdminAuditPage, { take: 10 });

  const areas = [
    {
      href: "/admin/routes",
      title: t("routesTitle"),
      desc: t("routesDesc"),
      icon: <Route className="h-6 w-6 text-primary" />,
    },
    {
      href: "/admin/stops",
      title: t("stopsTitle"),
      desc: t("stopsDesc"),
      icon: <MapPin className="h-6 w-6 text-primary" />,
    },
    {
      href: "/admin/timetables",
      title: t("timetablesTitle"),
      desc: t("timetablesDesc"),
      icon: <Clock className="h-6 w-6 text-primary" />,
    },
    {
      href: "/admin/users",
      title: t("usersTitle"),
      desc: t("usersDesc"),
      icon: <Users className="h-6 w-6 text-primary" />,
    },
    {
      href: "/admin/policies",
      title: t("policiesTitle"),
      desc: t("policiesDesc"),
      icon: <FileCheck className="h-6 w-6 text-primary" />,
    },
    {
      href: "/admin/audit",
      title: t("auditTitle"),
      desc: t("auditDesc"),
      icon: <ScrollText className="h-6 w-6 text-primary" />,
    },
  ];

  const auditColumns = [
    {
      id: "action",
      header: t("action"),
      cell: (a: AdminAuditDto) => (
        <span className="font-mono text-small font-semibold text-primary">{a.action}</span>
      ),
      sortValue: (a: AdminAuditDto) => a.action,
    },
    {
      id: "entity",
      header: t("entity"),
      cell: (a: AdminAuditDto) => (
        <span className="text-small">
          {a.entityType}: {a.entityId}
        </span>
      ),
    },
    {
      id: "actor",
      header: t("actor"),
      cell: (a: AdminAuditDto) => a.actorRole || t("systemActor"),
    },
    {
      id: "time",
      header: t("time"),
      cell: (a: AdminAuditDto) => (
        <span className="text-small text-muted">
          {formatDate(a.createdAt, locale)} {formatTime(a.createdAt)}
        </span>
      ),
      sortValue: (a: AdminAuditDto) => a.createdAt,
    },
  ];

  return (
    <div className="flex flex-col gap-8 p-6">
      <div>
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-primary" />
          <h1 className="text-h1 font-bold">{t("overview")}</h1>
        </div>
        <p className="mt-1 text-muted">{t("overviewSubtitle")}</p>
      </div>

      {/* Grid of Areas */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {areas.map((a) => (
          <Link key={a.href} href={a.href} className="group">
            <Card className="flex h-full flex-col justify-between p-5 transition-shadow hover:shadow-md">
              <div className="flex items-start gap-4">
                <div className="rounded-lg bg-primary/10 p-2.5">{a.icon}</div>
                <div>
                  <h3 className="text-body font-semibold group-hover:text-primary">{a.title}</h3>
                  <p className="mt-1 text-small text-muted">{a.desc}</p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {/* Recent Audit Events */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-h2 font-semibold">{t("recentAuditEvents")}</h2>
            <p className="text-small text-muted">{t("recentAuditSubtitle")}</p>
          </div>
          <Link href="/admin/audit" className="text-small font-medium text-primary hover:underline">
            {t("viewAllAudit")}
          </Link>
        </div>

        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : error ? (
          <OpsError error={error} retry={refetch} />
        ) : (
          <DataTable
            label={t("recentAuditLogs")}
            columns={auditColumns}
            rows={auditPage?.items || []}
            rowKey={(l) => l.id}
            empty={<OpsEmpty />}
          />
        )}
      </div>
    </div>
  );
}
