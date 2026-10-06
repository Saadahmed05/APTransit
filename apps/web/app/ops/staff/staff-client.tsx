"use client";

import { useState } from "react";
import { z } from "zod";
import {
  DeviceDto,
  StaffDto,
} from "@aptransit/shared";
import {
  Button,
  DataTable,
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
} from "@aptransit/ui";
import { useTranslations } from "next-intl";
import { useOpsDepots, useOpsFilters, useOpsQuery } from "../../../lib/ops";
import { OpsEmpty, OpsError, useOpsWrite, WriteError } from "../ops-common";
import { ShieldCheck, ShieldX, Smartphone, UserPlus } from "lucide-react";

export default function StaffClient() {
  const t = useTranslations("opsApp");
  const common = useTranslations("common");
  const { depotId } = useOpsFilters();

  const [activeTab, setActiveTab] = useState("DRIVERS");
  const [addStaffOpen, setAddStaffOpen] = useState(false);

  // Form state
  const [staffType, setStaffType] = useState<"DRIVER" | "CONDUCTOR">("DRIVER");
  const [employeeCode, setEmployeeCode] = useState("");
  const [name, setName] = useState("");
  const [licenseNo, setLicenseNo] = useState("");
  const [selectedDepot, setSelectedDepot] = useState(depotId || "");

  const depots = useOpsDepots();

  // Queries
  const {
    data: staffList,
    isLoading: isStaffLoading,
    error: staffError,
    refetch: refetchStaff,
  } = useOpsQuery("/ops/staff", z.array(StaffDto), depotId ? { depotId } : {});

  const {
    data: devicesList,
    isLoading: isDevicesLoading,
    error: devicesError,
    refetch: refetchDevices,
  } = useOpsQuery("/ops/devices", z.array(DeviceDto), depotId ? { depotId } : {});

  const addStaffMutation = useOpsWrite(StaffDto);
  const approveDeviceMutation = useOpsWrite(DeviceDto);
  const revokeDeviceMutation = useOpsWrite(DeviceDto);

  const handleAddStaff = async () => {
    if (!employeeCode.trim()) return;
    await addStaffMutation.mutateAsync({
      path: "/ops/staff",
      body: {
        type: staffType,
        employeeCode: employeeCode.trim(),
        name: name.trim() || undefined,
        licenseNo: licenseNo.trim() || undefined,
        depotId: selectedDepot || depots.data?.[0]?.id || "",
      },
    });

    setAddStaffOpen(false);
    setEmployeeCode("");
    setName("");
    setLicenseNo("");
    refetchStaff();
  };

  const handleApproveDevice = async (devId: string) => {
    await approveDeviceMutation.mutateAsync({
      path: `/ops/devices/${devId}/approve`,
      body: {},
    });
    refetchDevices();
  };

  const handleRevokeDevice = async (devId: string) => {
    await revokeDeviceMutation.mutateAsync({
      path: `/ops/devices/${devId}/revoke`,
      body: {},
    });
    refetchDevices();
  };

  const drivers = staffList?.filter((s) => s.type === "DRIVER") || [];
  const conductors = staffList?.filter((s) => s.type === "CONDUCTOR") || [];

  const staffColumns = [
    {
      id: "code",
      header: t("code"),
      cell: (s: StaffDto) => <span className="font-semibold">{s.employeeCode}</span>,
      sortValue: (s: StaffDto) => s.employeeCode,
    },
    {
      id: "name",
      header: t("name"),
      cell: (s: StaffDto) => s.name || common("notAvailable"),
      sortValue: (s: StaffDto) => s.name || "",
    },
    {
      id: "license",
      header: t("license"),
      cell: (s: StaffDto) => s.licenseNo || common("notAvailable"),
    },
    {
      id: "email",
      header: t("email"),
      cell: (s: StaffDto) => s.email || common("notAvailable"),
    },
  ];

  const deviceColumns = [
    {
      id: "label",
      header: t("deviceLabel"),
      cell: (d: DeviceDto) => (
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-muted" />
          <span className="font-semibold">{d.label}</span>
        </div>
      ),
      sortValue: (d: DeviceDto) => d.label,
    },
    {
      id: "user",
      header: t("user"),
      cell: (d: DeviceDto) => d.userId,
    },
    {
      id: "status",
      header: t("status"),
      cell: (d: DeviceDto) => {
        if (d.revokedAt) {
          return <span className="rounded bg-danger/10 px-2 py-0.5 text-small font-semibold text-danger">{t("revoked")}</span>;
        }
        if (d.approvedAt) {
          return <span className="rounded bg-success/10 px-2 py-0.5 text-small font-semibold text-success">{t("approved")}</span>;
        }
        return <span className="rounded bg-warning/10 px-2 py-0.5 text-small font-semibold text-warning">{t("pending")}</span>;
      },
    },
    {
      id: "actions",
      header: t("actions"),
      cell: (d: DeviceDto) => (
        <div className="flex items-center gap-2">
          {!d.approvedAt && !d.revokedAt && (
            <Button
              variant="secondary"
              className="flex items-center gap-1 text-success"
              onClick={() => handleApproveDevice(d.id)}
              loading={approveDeviceMutation.isPending}
            >
              <ShieldCheck className="h-4 w-4" />
              <span>{t("approve")}</span>
            </Button>
          )}
          {d.approvedAt && !d.revokedAt && (
            <Button
              variant="danger"
              className="flex items-center gap-1"
              onClick={() => handleRevokeDevice(d.id)}
              loading={revokeDeviceMutation.isPending}
            >
              <ShieldX className="h-4 w-4" />
              <span>{t("revoke")}</span>
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h1 font-bold">{t("staffAndDevices")}</h1>
          <p className="text-muted">{t("staffDescription")}</p>
        </div>

        <Button
          variant="primary"
          className="flex items-center gap-2"
          onClick={() => {
            setStaffType(activeTab === "DRIVERS" ? "DRIVER" : "CONDUCTOR");
            setAddStaffOpen(true);
          }}
        >
          <UserPlus className="h-4 w-4" />
          <span>{t("addStaff")}</span>
        </Button>
      </div>

      {/* Staff Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="DRIVERS">{t("drivers")} ({drivers.length})</TabsTrigger>
          <TabsTrigger value="CONDUCTORS">{t("conductors")} ({conductors.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="DRIVERS" className="mt-4">
          {isStaffLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : staffError ? (
            <OpsError error={staffError} retry={refetchStaff} />
          ) : (
            <DataTable
              label={t("drivers")}
              columns={staffColumns}
              rows={drivers}
              rowKey={(d) => d.id}
              empty={<OpsEmpty />}
            />
          )}
        </TabsContent>

        <TabsContent value="CONDUCTORS" className="mt-4">
          {isStaffLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : staffError ? (
            <OpsError error={staffError} retry={refetchStaff} />
          ) : (
            <DataTable
              label={t("conductors")}
              columns={staffColumns}
              rows={conductors}
              rowKey={(d) => d.id}
              empty={<OpsEmpty />}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Devices Section */}
      <div className="mt-6 flex flex-col gap-4">
        <div>
          <h2 className="text-h2 font-semibold">{t("registeredDevices")}</h2>
          <p className="text-muted">{t("devicesDescription")}</p>
        </div>

        {isDevicesLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : devicesError ? (
          <OpsError error={devicesError} retry={refetchDevices} />
        ) : (
          <DataTable
            label={t("registeredDevices")}
            columns={deviceColumns}
            rows={devicesList || []}
            rowKey={(d) => d.id}
            empty={<OpsEmpty />}
          />
        )}
      </div>

      {/* Add Staff Dialog */}
      <Dialog open={addStaffOpen} onOpenChange={setAddStaffOpen}>
        <DialogContent>
          <DialogTitle>{t("addStaffTitle")}</DialogTitle>
          <DialogDescription>{t("addStaffHint")}</DialogDescription>

          <div className="flex flex-col gap-4 py-4">
            <Field id="staff-type" label={t("type")}>
              <Select
                value={staffType}
                onValueChange={(val: string) => setStaffType(val as "DRIVER" | "CONDUCTOR")}
              >
                <SelectItem value="DRIVER">{t("driver")}</SelectItem>
                <SelectItem value="CONDUCTOR">{t("conductor")}</SelectItem>
              </Select>
            </Field>

            <Field id="staff-emp-code" label={t("employeeCode")}>
              <Input
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                placeholder="EMP-1001"
              />
            </Field>

            <Field id="staff-name" label={t("name")}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
              />
            </Field>

            {staffType === "DRIVER" && (
              <Field id="staff-license" label={t("license")}>
                <Input
                  value={licenseNo}
                  onChange={(e) => setLicenseNo(e.target.value)}
                  placeholder="AP-DR-123456"
                />
              </Field>
            )}

            <Field id="staff-depot" label={common("depot")}>
              <Select
                value={selectedDepot || (depots.data?.[0]?.id ?? "")}
                onValueChange={setSelectedDepot}
              >
                {depots.data?.map((dp) => (
                  <SelectItem key={dp.id} value={dp.id}>
                    {dp.nameEn}
                  </SelectItem>
                ))}
              </Select>
            </Field>

            <WriteError error={addStaffMutation.error} />

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setAddStaffOpen(false)}>
                {common("close")}
              </Button>
              <Button
                variant="primary"
                onClick={handleAddStaff}
                loading={addStaffMutation.isPending}
                disabled={!employeeCode.trim()}
              >
                {t("saveStaff")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
