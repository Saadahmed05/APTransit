"use client";

import { useState } from "react";
import {
  OpsTripProfileDto,
  formatDate,
  formatTime,
  can,
  type AssignmentDto,
  type IncidentDto,
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
  Skeleton,
  StatusBadge,
  Textarea,
} from "@aptransit/ui";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMe } from "../../../../components/auth-provider";
import { useOpsQuery } from "../../../../lib/ops";
import { OpsEmpty, OpsError, useOpsWrite, WriteError } from "../../ops-common";
import { ArrowLeft, RefreshCw, XCircle, AlertTriangle, Clock } from "lucide-react";

export default function TripDetailClient({ id }: { id: string }) {
  const t = useTranslations("opsApp");
  const common = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const me = useMe();

  const {
    data: trip,
    isLoading,
    error,
    refetch,
  } = useOpsQuery(`/ops/trips/${id}`, OpsTripProfileDto);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const cancelMutation = useOpsWrite(OpsTripProfileDto);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="p-6">
        <OpsError error={error} retry={refetch} />
      </div>
    );
  }

  const userRoles = me.data?.roles.map((r) => r.role) || [];
  const canManage = can(userRoles, "trip:cancel");
  const canReplace = can(userRoles, "trip:replace-bus");

  const handleCancelTrip = async () => {
    if (!cancelReason.trim()) return;
    await cancelMutation.mutateAsync({
      path: `/ops/trips/${id}/cancel`,
      body: { reason: cancelReason.trim() },
    });
    setCancelOpen(false);
    setCancelReason("");
    refetch();
  };

  const assignmentColumns = [
    {
      id: "bus",
      header: t("bus"),
      cell: (a: AssignmentDto) => (
        <Link href={`/ops/buses/${a.busId}`} className="font-semibold text-primary hover:underline">
          {a.busId}
        </Link>
      ),
      sortValue: (a: AssignmentDto) => a.busId,
    },
    {
      id: "driver",
      header: t("driver"),
      cell: (a: AssignmentDto) => a.driverId,
    },
    {
      id: "conductor",
      header: t("conductor"),
      cell: (a: AssignmentDto) => a.conductorId || common("notAvailable"),
    },
    {
      id: "reason",
      header: t("type"),
      cell: (a: AssignmentDto) => a.reason,
    },
    {
      id: "started",
      header: t("departure"),
      cell: (a: AssignmentDto) => formatTime(a.startedAt),
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Back button */}
      <div>
        <Link
          href="/ops/trips"
          className="inline-flex items-center gap-2 text-small font-medium text-muted hover:text-fg"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{t("trips")}</span>
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-h1 font-bold">{trip.code}</h1>
            <StatusBadge status={trip.displayStatus} label={trip.displayStatus} />
            {trip.delayMinutes > 0 && (
              <span className="flex items-center gap-1 text-small font-semibold text-status-warning">
                <Clock className="h-4 w-4" />
                <span>+{trip.delayMinutes} min</span>
              </span>
            )}
          </div>
          <p className="text-muted">
            {locale === "te" ? trip.routeNameTe : trip.routeNameEn} · {formatDate(trip.serviceDate, locale)}
          </p>
        </div>

        {/* Manager Actions */}
        <div className="flex flex-wrap items-center gap-3">
          {canReplace && trip.status !== "COMPLETED" && trip.status !== "CANCELLED" && (
            <Button
              variant="secondary"
              className="flex items-center gap-2"
              onClick={() => router.push(`/ops/trips/${id}/replace`)}
            >
              <RefreshCw className="h-4 w-4" />
              <span>{t("replaceBus")}</span>
            </Button>
          )}

          {canManage && trip.status !== "COMPLETED" && trip.status !== "CANCELLED" && (
            <Button
              variant="danger"
              className="flex items-center gap-2"
              onClick={() => setCancelOpen(true)}
            >
              <XCircle className="h-4 w-4" />
              <span>{t("cancelTrip")}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Facts grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="flex flex-col p-4">
          <span className="text-small text-muted">{t("passengers")}</span>
          <span className="text-h2 font-bold">{trip.passengers}</span>
        </Card>

        <Card className="flex flex-col p-4">
          <span className="text-small text-muted">{t("departure")}</span>
          <span className="text-body font-semibold">{formatTime(trip.scheduledDepartureAt)}</span>
        </Card>

        <Card className="flex flex-col p-4">
          <span className="text-small text-muted">{t("arrival")}</span>
          <span className="text-body font-semibold">{formatTime(trip.scheduledArrivalAt)}</span>
        </Card>

        <Card className="flex flex-col p-4">
          <span className="text-small text-muted">{t("bus")}</span>
          <span className="text-body font-semibold">
            {trip.assignment?.busId ? (
              <Link href={`/ops/buses/${trip.assignment.busId}`} className="text-primary hover:underline">
                {trip.assignment.busRegNo}
              </Link>
            ) : (
              t("unassigned")
            )}
          </span>
        </Card>
      </div>

      {/* Vertical Timeline */}
      <div className="flex flex-col gap-3">
        <h2 className="text-h2 font-semibold">{t("timeline")}</h2>
        <Card className="flex flex-col gap-4 p-6">
          <div className="relative border-l-2 border-default pl-6">
            {/* 1. Scheduled */}
            <div className="relative mb-6">
              <div className="absolute -left-8 top-1 h-3 w-3 rounded-full bg-primary" />
              <div className="flex flex-col">
                <span className="text-small font-semibold">{t("scheduled")}</span>
                <span className="text-small text-muted">{formatTime(trip.scheduledDepartureAt)}</span>
              </div>
            </div>

            {/* 2. Started */}
            {trip.actualDepartureAt && (
              <div className="relative mb-6">
                <div className="absolute -left-8 top-1 h-3 w-3 rounded-full bg-status-success-solid" />
                <div className="flex flex-col">
                  <span className="text-small font-semibold">{t("departed")}</span>
                  <span className="text-small text-muted">{formatTime(trip.actualDepartureAt)}</span>
                </div>
              </div>
            )}

            {/* 3. Incidents / Replacements */}
            {trip.assignments.length > 1 && (
              <div className="relative mb-6">
                <div className="absolute -left-8 top-1 h-3 w-3 rounded-full bg-status-warning-solid" />
                <div className="flex flex-col">
                  <span className="text-small font-semibold text-status-warning">{t("replacementOccurred")}</span>
                  <span className="text-small text-muted">
                    {formatTime(trip.assignments[trip.assignments.length - 1]!.startedAt)}
                  </span>
                </div>
              </div>
            )}

            {/* 4. Completed or Cancelled */}
            {trip.status === "COMPLETED" && (
              <div className="relative">
                <div className="absolute -left-8 top-1 h-3 w-3 rounded-full bg-status-success-solid" />
                <div className="flex flex-col">
                  <span className="text-small font-semibold text-status-success">{t("completed")}</span>
                  <span className="text-small text-muted">
                    {trip.actualArrivalAt ? formatTime(trip.actualArrivalAt) : common("notAvailable")}
                  </span>
                </div>
              </div>
            )}

            {trip.status === "CANCELLED" && (
              <div className="relative">
                <div className="absolute -left-8 top-1 h-3 w-3 rounded-full bg-status-danger-solid" />
                <div className="flex flex-col">
                  <span className="text-small font-semibold text-status-danger">{t("cancelled")}</span>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Open Incidents */}
      {trip.incidents.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-h2 font-semibold text-status-warning">{t("openIncidents")}</h2>
          <div className="flex flex-col gap-3">
            {trip.incidents.map((inc: IncidentDto) => (
              <Card key={inc.id} className="flex flex-col gap-2 border-status-warning p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-status-warning" />
                    <span className="font-semibold">{inc.type}</span>
                    <span className="text-small text-muted">({inc.severity})</span>
                  </div>
                  <span className="text-small text-muted">{formatTime(inc.createdAt)}</span>
                </div>
                {inc.note && <p className="text-body text-muted">{inc.note}</p>}
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Assignment History */}
      <div className="flex flex-col gap-3">
        <h2 className="text-h2 font-semibold">{t("assignmentHistory")}</h2>
        <DataTable
          label={t("assignmentHistory")}
          columns={assignmentColumns}
          rows={trip.assignments}
          rowKey={(a) => a.id}
          empty={<OpsEmpty />}
        />
      </div>

      {/* Cancel trip Dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogTitle>{t("cancelTrip")}</DialogTitle>
          <DialogDescription>
            {t("cancelWarning", { count: trip.passengers })}
          </DialogDescription>

          <div className="flex flex-col gap-4 py-4">
            <Field id="trip-cancel-reason" label={t("cancellationReason")}>
              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder={t("cancellationReasonPlaceholder")}
              />
            </Field>

            <WriteError error={cancelMutation.error} />

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setCancelOpen(false)}>
                {common("close")}
              </Button>
              <Button
                variant="danger"
                onClick={handleCancelTrip}
                loading={cancelMutation.isPending}
                disabled={!cancelReason.trim()}
              >
                {t("confirmCancel")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
