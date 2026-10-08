"use client";

import { useState } from "react";
import { z } from "zod";
import {
  BusDto,
  OpsTripProfileDto,
  TripDto,
} from "@aptransit/shared";
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Field,
  Input,
  Skeleton,
  Textarea,
} from "@aptransit/ui";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useOpsQuery } from "../../../../../lib/ops";
import { OpsError, useOpsWrite, WriteError } from "../../../ops-common";
import { ArrowLeft, Check, RefreshCw } from "lucide-react";

export default function ReplaceBusClient({ id }: { id: string }) {
  const t = useTranslations("opsApp");
  const common = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialReason = searchParams.get("reason") || "";

  const {
    data: trip,
    isLoading: isTripLoading,
    error: tripError,
    refetch: refetchTrip,
  } = useOpsQuery(`/ops/trips/${id}`, OpsTripProfileDto);

  const {
    data: availableBuses,
    isLoading: isBusesLoading,
    error: busesError,
    refetch: refetchBuses,
  } = useOpsQuery(
    "/ops/buses/available",
    z.array(BusDto),
    trip ? { depotId: trip.depotId } : {},
  );

  const [reason, setReason] = useState(initialReason);
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  const [driverId, setDriverId] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const replaceMutation = useOpsWrite(TripDto);

  if (isTripLoading || isBusesLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (tripError || !trip) {
    return (
      <div className="p-6">
        <OpsError error={tripError} retry={refetchTrip} />
      </div>
    );
  }

  const currentBus = trip.assignment?.busRegNo || t("unassigned");
  const selectedBus = availableBuses?.find((b) => b.id === selectedBusId);

  const handleConfirmReplace = async () => {
    if (!selectedBusId || !reason.trim()) return;

    await replaceMutation.mutateAsync({
      path: `/ops/trips/${id}/replace-bus`,
      body: {
        busId: selectedBusId,
        driverId: driverId.trim() || undefined,
        reason: reason.trim(),
      },
    });

    setConfirmOpen(false);
    router.push(`/ops/trips/${id}`);
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Back button */}
      <div>
        <Link
          href={`/ops/trips/${id}`}
          className="inline-flex items-center gap-2 text-small font-medium text-muted hover:text-fg"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{trip.code}</span>
        </Link>
      </div>

      <div>
        <h1 className="text-h1 font-bold">{t("replaceBus")}</h1>
        <p className="text-muted">
          {trip.code} · {t("currentBus")}: <span className="font-semibold text-fg">{currentBus}</span>
        </p>
      </div>

      {/* Step 1: Reason */}
      <Card className="flex flex-col gap-4 p-6">
        <h2 className="text-h2 font-semibold">1. {t("replacementReason")}</h2>
        <Field id="replace-reason" label={t("reasonLabel")} hint={t("reasonHint")}>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("replacementReasonPlaceholder")}
          />
        </Field>
      </Card>

      {/* Step 2: Available Buses */}
      <Card className="flex flex-col gap-4 p-6">
        <h2 className="text-h2 font-semibold">2. {t("selectAvailableBus")}</h2>
        {busesError ? (
          <OpsError error={busesError} retry={refetchBuses} />
        ) : !availableBuses || availableBuses.length === 0 ? (
          <p className="text-muted">{t("noAvailableBuses")}</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {availableBuses.map((bus) => {
              const isSelected = bus.id === selectedBusId;
              return (
                <button
                  type="button"
                  key={bus.id}
                  onClick={() => setSelectedBusId(bus.id)}
                  className={`flex cursor-pointer text-left flex-col justify-between rounded-lg border p-4 transition-colors ${
                    isSelected
                      ? "border-primary bg-primary/5 ring-2 ring-primary"
                      : "border-default hover:border-strong bg-surface"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-h3 font-bold">{bus.regNo}</span>
                      <p className="text-small text-muted">{bus.serviceType}</p>
                    </div>
                    {isSelected && (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-on-primary">
                        <Check className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                  <div className="mt-4 flex items-center justify-between text-small text-muted">
                    <span>{bus.totalSeats} {common("seat")}</span>
                    <span>{bus.status}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-4">
          <Field id="replace-driver" label={t("optionalDriver")}>
            <Input
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              placeholder={t("driverIdPlaceholder")}
            />
          </Field>
        </div>
      </Card>

      {/* Step 3: Trigger confirmation */}
      <div className="flex justify-end gap-4">
        <Button variant="ghost" onClick={() => router.push(`/ops/trips/${id}`)}>
          {common("close")}
        </Button>
        <Button
          variant="primary"
          disabled={!selectedBusId || !reason.trim()}
          onClick={() => setConfirmOpen(true)}
        >
          {t("proceedToConfirm")}
        </Button>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogTitle>{t("confirmReplacementTitle")}</DialogTitle>
          <DialogDescription>
            {t("replacementConsequence", {
              currentBus,
              newBus: selectedBus?.regNo || "",
              count: trip.passengers,
            })}
          </DialogDescription>

          <WriteError error={replaceMutation.error} />

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              {common("close")}
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmReplace}
              loading={replaceMutation.isPending}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              <span>{t("confirmReplacement")}</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
