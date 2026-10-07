"use client";

import { useState } from "react";
import {
  AdminAuditPage,
  formatDate,
  formatTime,
  type AdminAuditDto,
} from "@aptransit/shared";
import {
  Button,
  Card,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Field,
  Input,
  Skeleton,
} from "@aptransit/ui";
import { useLocale, useTranslations } from "next-intl";
import { useAdminQuery } from "../../../lib/admin";
import { OpsEmpty, OpsError } from "../../ops/ops-common";
import { Eye, ScrollText } from "lucide-react";

export default function AuditClient() {
  const t = useTranslations("adminApp");
  const common = useTranslations("common");
  const locale = useLocale();

  // Filter state
  const [actionFilter, setActionFilter] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [selectedLog, setSelectedLog] = useState<AdminAuditDto | null>(null);

  const queryParams: Record<string, string | number | undefined> = {
    limit: 50,
  };
  if (actionFilter.trim()) queryParams.q = actionFilter.trim();
  if (entityTypeFilter.trim()) queryParams.entityType = entityTypeFilter.trim();
  if (fromDate) queryParams.from = `${fromDate}T00:00:00.000Z`;
  if (toDate) queryParams.to = `${toDate}T23:59:59.999Z`;

  const {
    data: auditPage,
    isLoading,
    error,
    refetch,
  } = useAdminQuery("/admin/audit-logs", AdminAuditPage, queryParams);

  const columns = [
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
          <span className="font-semibold">{a.entityType}</span>
          <span className="text-muted"> : {a.entityId}</span>
        </span>
      ),
      sortValue: (a: AdminAuditDto) => a.entityType,
    },
    {
      id: "actor",
      header: t("actor"),
      cell: (a: AdminAuditDto) => (
        <div className="flex flex-col text-small">
          <span className="font-semibold">{a.actorRole || t("systemActor")}</span>
          <span className="text-xs text-muted">{a.actorUserId || ""}</span>
        </div>
      ),
    },
    {
      id: "timestamp",
      header: t("time"),
      cell: (a: AdminAuditDto) => (
        <span className="text-small text-muted">
          {formatDate(a.createdAt, locale)} {formatTime(a.createdAt)}
        </span>
      ),
      sortValue: (a: AdminAuditDto) => a.createdAt,
    },
    {
      id: "inspect",
      header: t("actions"),
      cell: (a: AdminAuditDto) => (
        <Button
          variant="ghost"
          className="flex items-center gap-1"
          onClick={() => setSelectedLog(a)}
        >
          <Eye className="h-3.5 w-3.5" />
          <span>{t("viewDiff")}</span>
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <div className="flex items-center gap-2">
          <ScrollText className="h-6 w-6 text-primary" />
          <h1 className="text-h1 font-bold">{t("auditTitle")}</h1>
        </div>
        <p className="text-muted">{t("auditDesc")}</p>
      </div>

      {/* Filters bar */}
      <Card className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field id="audit-action-filter" label={t("actionFilter")}>
          <Input
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            placeholder="e.g. route.update"
          />
        </Field>

        <Field id="audit-entity-filter" label={t("entityFilter")}>
          <Input
            value={entityTypeFilter}
            onChange={(e) => setEntityTypeFilter(e.target.value)}
            placeholder="e.g. ROUTE, STOP"
          />
        </Field>

        <Field id="audit-from-date" label={t("fromDate")}>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </Field>

        <Field id="audit-to-date" label={t("toDate")}>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </Field>
      </Card>

      {/* Logs Table */}
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : error ? (
        <OpsError error={error} retry={refetch} />
      ) : (
        <DataTable
          label={t("auditLogs")}
          columns={columns}
          rows={auditPage?.items || []}
          rowKey={(l) => l.id}
          empty={<OpsEmpty />}
        />
      )}

      {/* Diff Drawer / Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-3xl">
          <DialogTitle>{t("auditDiffTitle")}</DialogTitle>
          <DialogDescription>
            {selectedLog?.action} on {selectedLog?.entityType} ({selectedLog?.entityId})
          </DialogDescription>

          <div className="flex flex-col gap-4 py-3">
            <div className="grid grid-cols-2 gap-4 rounded-lg bg-surface/50 p-3 text-small">
              <div>
                <span className="text-muted">{t("actor")}:</span>{" "}
                <span className="font-semibold">{selectedLog?.actorRole || t("systemActor")}</span>
              </div>
              <div>
                <span className="text-muted">IP:</span>{" "}
                <span className="font-mono">{selectedLog?.ip || common("notAvailable")}</span>
              </div>
              <div>
                <span className="text-muted">{t("time")}:</span>{" "}
                <span>{selectedLog?.createdAt ? `${formatDate(selectedLog.createdAt, locale)} ${formatTime(selectedLog.createdAt)}` : ""}</span>
              </div>
              <div>
                <span className="text-muted">User Agent:</span>{" "}
                <span className="truncate text-xs">{selectedLog?.userAgent || common("notAvailable")}</span>
              </div>
            </div>

            {/* Before and After JSON Diff */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <span className="text-small font-semibold text-danger">{t("beforeState")}</span>
                <pre className="h-64 overflow-auto rounded-md border border-border bg-neutral-900 p-3 font-mono text-xs text-neutral-100">
                  {selectedLog?.before
                    ? JSON.stringify(selectedLog.before, null, 2)
                    : t("noBeforeState")}
                </pre>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-small font-semibold text-success">{t("afterState")}</span>
                <pre className="h-64 overflow-auto rounded-md border border-border bg-neutral-900 p-3 font-mono text-xs text-neutral-100">
                  {selectedLog?.after
                    ? JSON.stringify(selectedLog.after, null, 2)
                    : t("noAfterState")}
                </pre>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="ghost" onClick={() => setSelectedLog(null)}>
                {common("close")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
