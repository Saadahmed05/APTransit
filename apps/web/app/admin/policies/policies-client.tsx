"use client";

import { useState } from "react";
import { z } from "zod";
import {
  AdminFareDto,
  AdminRefundDto,
  AdminSettingDto,
  formatDate,
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
  Select,
  SelectItem,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from "@aptransit/ui";
import { useLocale, useTranslations } from "next-intl";
import { useAdminMutation, useAdminQuery } from "../../../lib/admin";
import { useOpsBusTypes } from "../../../lib/ops";
import { OpsError } from "../../ops/ops-common";
import { FileCheck, Save } from "lucide-react";

export default function PoliciesClient() {
  const t = useTranslations("adminApp");
  const common = useTranslations("common");
  const locale = useLocale();

  const [activeTab, setActiveTab] = useState("FARES");
  const { data: busTypes } = useOpsBusTypes();

  // Queries
  const {
    data: fares,
    isLoading: isFaresLoading,
    error: faresError,
    refetch: refetchFares,
  } = useAdminQuery("/admin/fare-rules", z.array(AdminFareDto));

  const { refetch: refetchRefunds } = useAdminQuery(
    "/admin/refund-policies",
    z.array(AdminRefundDto),
  );

  const { data: settings, refetch: refetchSettings } = useAdminQuery(
    "/admin/settings",
    z.array(AdminSettingDto),
  );

  // Fare form
  const [fareBusTypeId, setFareBusTypeId] = useState("");
  const [baseFareRupees, setBaseFareRupees] = useState("20");
  const [perKmRupees, setPerKmRupees] = useState("1.5");
  const [minFareRupees, setMinFareRupees] = useState("25");
  const [fareValidFrom] = useState("2026-10-07T00:00:00.000Z");

  // Refund policy form
  const [policyName, setPolicyName] = useState("Standard AP Transport Refund Policy");
  const [cancellationFeeRupees, setCancellationFeeRupees] = useState("0");
  const [refundTiers, setRefundTiers] = useState<Array<{ minHoursBefore: number; percent: number }>>([
    { minHoursBefore: 24, percent: 90 },
    { minHoursBefore: 12, percent: 75 },
    { minHoursBefore: 1, percent: 50 },
    { minHoursBefore: 0, percent: 0 },
  ]);
  const [refundValidFrom] = useState("2026-10-07T00:00:00.000Z");

  // Settings form
  const [holdMinutes, setHoldMinutes] = useState(10);
  const [maxPassengers, setMaxPassengers] = useState(6);
  const [daysAhead, setDaysAhead] = useState(30);
  const [closeMinutesBefore, setCloseMinutesBefore] = useState(10);
  const [qrPeriodSec, setQrPeriodSec] = useState(30);

  const [prevSettings, setPrevSettings] = useState<AdminSettingDto[] | null>(null);
  if (settings && settings !== prevSettings) {
    setPrevSettings(settings);
    for (const s of settings) {
      if (s.key === "booking.holdMinutes") setHoldMinutes(Number(s.value));
      if (s.key === "booking.maxPassengers") setMaxPassengers(Number(s.value));
      if (s.key === "booking.daysAhead") setDaysAhead(Number(s.value));
      if (s.key === "booking.closeMinutesBefore") setCloseMinutesBefore(Number(s.value));
      if (s.key === "qr.periodSec") setQrPeriodSec(Number(s.value));
    }
  }

  // Confirm dialogs
  const [confirmFareOpen, setConfirmFareOpen] = useState(false);
  const [confirmRefundOpen, setConfirmRefundOpen] = useState(false);
  const [confirmSettingsOpen, setConfirmSettingsOpen] = useState(false);

  const fareMutation = useAdminMutation<AdminFareDto>("PUT", AdminFareDto);
  const refundMutation = useAdminMutation<AdminRefundDto>("PUT", AdminRefundDto);
  const settingsMutation = useAdminMutation<AdminSettingDto[]>("PUT", z.array(AdminSettingDto));

  const busTypeMap = new Map((busTypes || []).map((bt) => [bt.id, bt]));

  const handleSaveFare = async () => {
    const btId = fareBusTypeId || busTypes?.[0]?.id;
    if (!btId) return;

    await fareMutation.mutateAsync({
      path: "/admin/fare-rules",
      body: {
        busTypeId: btId,
        baseFarePaise: Math.round(parseFloat(baseFareRupees) * 100),
        perKmPaise: Math.round(parseFloat(perKmRupees) * 100),
        minFarePaise: Math.round(parseFloat(minFareRupees) * 100),
        validFrom: fareValidFrom,
      },
    });

    setConfirmFareOpen(false);
    toast.success(t("policySaved"));
    refetchFares();
  };

  const handleSaveRefund = async () => {
    await refundMutation.mutateAsync({
      path: "/admin/refund-policies",
      body: {
        name: policyName,
        cancellationFeePaise: Math.round(parseFloat(cancellationFeeRupees) * 100),
        tiers: refundTiers,
        validFrom: refundValidFrom,
      },
    });

    setConfirmRefundOpen(false);
    toast.success(t("policySaved"));
    refetchRefunds();
  };

  const handleSaveSettings = async () => {
    await settingsMutation.mutateAsync({
      path: "/admin/settings",
      body: {
        settings: {
          "booking.holdMinutes": holdMinutes,
          "booking.maxPassengers": maxPassengers,
          "booking.daysAhead": daysAhead,
          "booking.closeMinutesBefore": closeMinutesBefore,
          "qr.periodSec": qrPeriodSec,
        },
      },
    });

    setConfirmSettingsOpen(false);
    toast.success(t("settingsSaved"));
    refetchSettings();
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <div className="flex items-center gap-2">
          <FileCheck className="h-6 w-6 text-primary" />
          <h1 className="text-h1 font-bold">{t("policiesTitle")}</h1>
        </div>
        <p className="text-muted">{t("policiesDesc")}</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="FARES">{t("fareRules")}</TabsTrigger>
          <TabsTrigger value="REFUNDS">{t("refundPolicies")}</TabsTrigger>
          <TabsTrigger value="SETTINGS">{t("systemSettings")}</TabsTrigger>
        </TabsList>

        {/* 1. Fare Rules Section */}
        <TabsContent value="FARES" className="mt-4 flex flex-col gap-6">
          <Card className="flex flex-col gap-4 p-6">
            <h2 className="text-h2 font-semibold">{t("updateFareRule")}</h2>
            <p className="text-small text-muted">{t("fareRuleHint")}</p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field id="fare-bustype" label={t("busType")}>
                <Select
                  value={fareBusTypeId || busTypes?.[0]?.id || ""}
                  onValueChange={setFareBusTypeId}
                >
                  {busTypes?.map((bt) => (
                    <SelectItem key={bt.id} value={bt.id}>
                      {bt.nameEn}
                    </SelectItem>
                  ))}
                </Select>
              </Field>

              <Field id="fare-base" label={`${t("baseFare")} (₹)`}>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={baseFareRupees}
                  onChange={(e) => setBaseFareRupees(e.target.value)}
                />
              </Field>

              <Field id="fare-per-km" label={`${t("perKmFare")} (₹)`}>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={perKmRupees}
                  onChange={(e) => setPerKmRupees(e.target.value)}
                />
              </Field>

              <Field id="fare-min" label={`${t("minFare")} (₹)`}>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={minFareRupees}
                  onChange={(e) => setMinFareRupees(e.target.value)}
                />
              </Field>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="primary" onClick={() => setConfirmFareOpen(true)}>
                <Save className="mr-2 h-4 w-4" />
                <span>{t("saveFareRule")}</span>
              </Button>
            </div>
          </Card>

          {/* Current Fares List */}
          <div className="flex flex-col gap-3">
            <h3 className="text-h3 font-semibold">{t("activeFareRules")}</h3>
            {isFaresLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : faresError ? (
              <OpsError error={faresError} retry={refetchFares} />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {fares?.map((f) => {
                  const bt = busTypeMap.get(f.busTypeId);
                  return (
                    <Card key={f.id} className="flex flex-col gap-2 p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-bold">{bt ? bt.nameEn : f.busTypeId}</span>
                        <span className="rounded-sm bg-status-success-soft px-2 py-0.5 text-small font-semibold text-status-success">
                          Active
                        </span>
                      </div>
                      <div className="text-small text-muted">
                        <p>{t("baseFare")}: ₹{(f.baseFarePaise / 100).toFixed(2)}</p>
                        <p>{t("perKmFare")}: ₹{(f.perKmPaise / 100).toFixed(2)} / km</p>
                        <p>{t("minFare")}: ₹{(f.minFarePaise / 100).toFixed(2)}</p>
                        <p className="mt-1 text-small">Valid from: {formatDate(f.validFrom, locale)}</p>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* 2. Refund Policies Section */}
        <TabsContent value="REFUNDS" className="mt-4 flex flex-col gap-6">
          <Card className="flex flex-col gap-4 p-6">
            <h2 className="text-h2 font-semibold">{t("refundPolicyTiers")}</h2>
            <p className="text-small text-muted">{t("refundPolicyHint")}</p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="refund-policy-name" label={t("policyName")}>
                <Input
                  value={policyName}
                  onChange={(e) => setPolicyName(e.target.value)}
                />
              </Field>

              <Field id="refund-cancel-fee" label={`${t("cancellationFee")} (₹)`}>
                <Input
                  type="number"
                  min="0"
                  value={cancellationFeeRupees}
                  onChange={(e) => setCancellationFeeRupees(e.target.value)}
                />
              </Field>
            </div>

            {/* Tiers List */}
            <div className="flex flex-col gap-2">
              <span className="text-small font-semibold">{t("refundTiers")}:</span>
              {refundTiers.map((tier, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <span className="text-small w-40">
                    &gt;= {tier.minHoursBefore} {t("hoursBefore")}:
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={tier.percent}
                      onChange={(e) => {
                        const next = [...refundTiers];
                        next[idx] = { ...next[idx]!, percent: parseInt(e.target.value, 10) || 0 };
                        setRefundTiers(next);
                      }}
                      className="w-24"
                    />
                    <span className="text-small text-muted">% refund</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="primary" onClick={() => setConfirmRefundOpen(true)}>
                <Save className="mr-2 h-4 w-4" />
                <span>{t("saveRefundPolicy")}</span>
              </Button>
            </div>
          </Card>
        </TabsContent>

        {/* 3. System Settings Section */}
        <TabsContent value="SETTINGS" className="mt-4 flex flex-col gap-6">
          <Card className="flex flex-col gap-4 p-6">
            <h2 className="text-h2 font-semibold">{t("systemSettings")}</h2>
            <p className="text-small text-muted">{t("systemSettingsHint")}</p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="settings-hold-min" label={t("holdMinutes")}>
                <Input
                  type="number"
                  min="1"
                  max="60"
                  value={holdMinutes}
                  onChange={(e) => setHoldMinutes(parseInt(e.target.value, 10) || 10)}
                />
              </Field>

              <Field id="settings-max-passengers" label={t("maxPassengers")}>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  value={maxPassengers}
                  onChange={(e) => setMaxPassengers(parseInt(e.target.value, 10) || 6)}
                />
              </Field>

              <Field id="settings-days-ahead" label={t("daysAhead")}>
                <Input
                  type="number"
                  min="1"
                  max="120"
                  value={daysAhead}
                  onChange={(e) => setDaysAhead(parseInt(e.target.value, 10) || 30)}
                />
              </Field>

              <Field id="settings-close-min" label={t("closeMinutesBefore")}>
                <Input
                  type="number"
                  min="0"
                  max="60"
                  value={closeMinutesBefore}
                  onChange={(e) => setCloseMinutesBefore(parseInt(e.target.value, 10) || 10)}
                />
              </Field>

              <Field id="settings-qr-period" label={t("qrPeriodSec")}>
                <Input
                  type="number"
                  min="10"
                  max="120"
                  value={qrPeriodSec}
                  onChange={(e) => setQrPeriodSec(parseInt(e.target.value, 10) || 30)}
                />
              </Field>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="primary" onClick={() => setConfirmSettingsOpen(true)}>
                <Save className="mr-2 h-4 w-4" />
                <span>{t("saveSettings")}</span>
              </Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Confirm Fare Dialog */}
      <Dialog open={confirmFareOpen} onOpenChange={setConfirmFareOpen}>
        <DialogContent>
          <DialogTitle>{t("confirmFareUpdateTitle")}</DialogTitle>
          <DialogDescription>{t("confirmFareUpdateDesc")}</DialogDescription>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" onClick={() => setConfirmFareOpen(false)}>
              {common("close")}
            </Button>
            <Button variant="primary" onClick={handleSaveFare} loading={fareMutation.isPending}>
              {t("confirmAndSave")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Refund Dialog */}
      <Dialog open={confirmRefundOpen} onOpenChange={setConfirmRefundOpen}>
        <DialogContent>
          <DialogTitle>{t("confirmRefundUpdateTitle")}</DialogTitle>
          <DialogDescription>{t("confirmRefundUpdateDesc")}</DialogDescription>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" onClick={() => setConfirmRefundOpen(false)}>
              {common("close")}
            </Button>
            <Button variant="primary" onClick={handleSaveRefund} loading={refundMutation.isPending}>
              {t("confirmAndSave")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Settings Dialog */}
      <Dialog open={confirmSettingsOpen} onOpenChange={setConfirmSettingsOpen}>
        <DialogContent>
          <DialogTitle>{t("confirmSettingsUpdateTitle")}</DialogTitle>
          <DialogDescription>{t("confirmSettingsUpdateDesc")}</DialogDescription>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" onClick={() => setConfirmSettingsOpen(false)}>
              {common("close")}
            </Button>
            <Button variant="primary" onClick={handleSaveSettings} loading={settingsMutation.isPending}>
              {t("confirmAndSave")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
