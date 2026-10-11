"use client";

import { useState } from "react";
import { z } from "zod";
import {
  AdminRoleDto,
  AdminUserDto,
  can,
  type Role,
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
} from "@aptransit/ui";
import { useLocale, useTranslations } from "next-intl";
import { useMe } from "../../../components/auth-provider";
import { useAdminMutation, useAdminQuery } from "../../../lib/admin";
import { useStates } from "../../../lib/gov";
import { useOpsDepots } from "../../../lib/ops";
import { OpsEmpty, OpsError, WriteError } from "../../ops/ops-common";
import { Shield, Trash2, UserPlus, Users } from "lucide-react";

const ALL_ROLES: Role[] = [
  "CITIZEN",
  "DRIVER",
  "CONDUCTOR",
  "DEPOT_STAFF",
  "DEPOT_MANAGER",
  "DISTRICT_OFFICER",
  "TRANSPORT_OFFICER",
  "STATE_ADMIN",
  "SUPER_ADMIN",
];

export default function UsersClient() {
  const t = useTranslations("adminApp");
  const common = useTranslations("common");
  const locale = useLocale();
  const me = useMe();
  const depots = useOpsDepots();
  const { states } = useStates();

  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminUserDto | null>(null);

  // Grant role form
  const [roleToGrant, setRoleToGrant] = useState<Role>("DEPOT_STAFF");
  const [scopedDepotId, setScopedDepotId] = useState("");
  const [scopedDistrictId, setScopedDistrictId] = useState("");
  const [scopedStateId, setScopedStateId] = useState("");

  const {
    data: users,
    isLoading,
    error,
    refetch,
  } = useAdminQuery("/admin/users", z.array(AdminUserDto), search ? { q: search } : {});

  const grantMutation = useAdminMutation<AdminRoleDto>("POST", AdminRoleDto);
  const revokeMutation = useAdminMutation<AdminRoleDto>("DELETE", AdminRoleDto);

  const currentUserRoles = me.data?.roles.map((r) => r.role) || [];
  const canGrantAdminRoles = can(currentUserRoles, "user:roles:admin");

  const availableRoles = ALL_ROLES.filter((r) => {
    if (r === "STATE_ADMIN" || r === "SUPER_ADMIN") {
      return canGrantAdminRoles;
    }
    return true;
  });

  const isDepotScoped = ["DRIVER", "CONDUCTOR", "DEPOT_STAFF", "DEPOT_MANAGER"].includes(roleToGrant);
  const isDistrictScoped = roleToGrant === "DISTRICT_OFFICER";
  // D-034: state roles name their state; a state admin may only grant inside their own state
  const isStateScoped = ["STATE_ADMIN", "TRANSPORT_OFFICER"].includes(roleToGrant);
  const myStateIds = (me.data?.roles ?? []).flatMap((r) => (r.stateId ? [r.stateId] : []));
  const grantableStates = currentUserRoles.includes("SUPER_ADMIN") ? states : states.filter((s) => myStateIds.includes(s.id));

  const handleGrantRole = async () => {
    if (!selectedUser) return;

    await grantMutation.mutateAsync({
      path: `/admin/users/${selectedUser.id}/roles`,
      body: {
        role: roleToGrant,
        depotId: isDepotScoped ? (scopedDepotId || depots.data?.[0]?.id) : undefined,
        districtId: isDistrictScoped ? (scopedDistrictId || "dist_knl") : undefined,
        stateId: isStateScoped ? (scopedStateId || grantableStates[0]?.id) : undefined,
      },
    });

    refetch();
    // Update local selected user
    const updated = await refetch();
    const found = updated.data?.find((u) => u.id === selectedUser.id);
    if (found) setSelectedUser(found);
  };

  const handleRevokeRole = async (roleId: string) => {
    if (!selectedUser) return;

    await revokeMutation.mutateAsync({
      path: `/admin/users/${selectedUser.id}/roles/${roleId}`,
    });

    const updated = await refetch();
    const found = updated.data?.find((u) => u.id === selectedUser.id);
    if (found) setSelectedUser(found);
  };

  const columns = [
    {
      id: "name",
      header: t("name"),
      cell: (u: AdminUserDto) => <span className="font-semibold">{u.name || common("notAvailable")}</span>,
      sortValue: (u: AdminUserDto) => u.name || "",
    },
    {
      id: "email",
      header: t("email"),
      cell: (u: AdminUserDto) => u.email || common("notAvailable"),
      sortValue: (u: AdminUserDto) => u.email || "",
    },
    {
      id: "phone",
      header: t("phone"),
      cell: (u: AdminUserDto) => u.phone || common("notAvailable"),
    },
    {
      id: "roles",
      header: t("roles"),
      cell: (u: AdminUserDto) => (
        <div className="flex flex-wrap gap-1">
          {u.roles.map((r) => (
            <span
              key={r.id}
              className="rounded-sm bg-primary/10 px-2 py-0.5 text-small font-semibold text-primary"
            >
              {r.role}
            </span>
          ))}
        </div>
      ),
    },
    {
      id: "actions",
      header: t("actions"),
      cell: (u: AdminUserDto) => (
        <Button
          variant="secondary"
          className="flex items-center gap-1"
          onClick={() => {
            setSelectedUser(u);
            setRoleToGrant("DEPOT_STAFF");
          }}
        >
          <Shield className="h-3.5 w-3.5" />
          <span>{t("manageRoles")}</span>
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            <h1 className="text-h1 font-bold">{t("usersTitle")}</h1>
          </div>
          <p className="text-muted">{t("usersDesc")}</p>
        </div>
      </div>

      <div className="w-full max-w-sm">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchUsersPlaceholder")}
        />
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : error ? (
        <OpsError error={error} retry={refetch} />
      ) : (
        <DataTable
          label={t("users")}
          columns={columns}
          rows={users || []}
          rowKey={(u) => u.id}
          empty={<OpsEmpty />}
        />
      )}

      {/* User Roles Dialog / Drawer */}
      <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="max-w-lg">
          <DialogTitle>{t("manageRolesTitle")}</DialogTitle>
          <DialogDescription>
            {selectedUser?.name || selectedUser?.email}
          </DialogDescription>

          <div className="flex flex-col gap-6 py-3">
            {/* Current Roles */}
            <div className="flex flex-col gap-2">
              <span className="text-small font-semibold">{t("currentRoles")}:</span>
              {selectedUser?.roles.length === 0 ? (
                <p className="text-small text-muted">{t("noRolesAssigned")}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {selectedUser?.roles.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between rounded-md border border-default p-3"
                    >
                      <div>
                        <span className="font-semibold">{r.role}</span>
                        {(r.depotId || r.districtId) && (
                          <p className="text-small text-muted">
                            Scope: {r.depotId ? `Depot ${r.depotId}` : `District ${r.districtId}`}
                          </p>
                        )}
                      </div>

                      <Button
                        variant="ghost"
                        className="text-status-danger hover:bg-status-danger-soft"
                        onClick={() => handleRevokeRole(r.id)}
                        loading={revokeMutation.isPending}
                        aria-label={t("removeRole")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Grant Role Form */}
            <div className="flex flex-col gap-3 rounded-lg border border-default bg-surface/50 p-4">
              <span className="text-small font-semibold">{t("grantNewRole")}:</span>

              <Field id="user-role" label={t("selectRole")}>
                <Select
                  value={roleToGrant}
                  onValueChange={(val: string) => setRoleToGrant(val as Role)}
                >
                  {availableRoles.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role}
                    </SelectItem>
                  ))}
                </Select>
              </Field>

              {isDepotScoped && (
                <Field id="user-depot" label={common("depot")}>
                  <Select
                    value={scopedDepotId || (depots.data?.[0]?.id ?? "")}
                    onValueChange={setScopedDepotId}
                  >
                    {depots.data?.map((dp) => (
                      <SelectItem key={dp.id} value={dp.id}>
                        {dp.nameEn}
                      </SelectItem>
                    ))}
                  </Select>
                </Field>
              )}

              {isStateScoped && (
                <Field id="user-state" label={common("state")}>
                  <Select
                    value={scopedStateId || (grantableStates[0]?.id ?? "")}
                    onValueChange={setScopedStateId}
                  >
                    {grantableStates.map((st) => (
                      <SelectItem key={st.id} value={st.id}>
                        {locale === "te" ? st.nameTe : st.nameEn}
                      </SelectItem>
                    ))}
                  </Select>
                </Field>
              )}

              {isDistrictScoped && (
                <Field id="user-district" label={common("district")}>
                  <Input
                    value={scopedDistrictId}
                    onChange={(e) => setScopedDistrictId(e.target.value)}
                    placeholder="dist_knl"
                  />
                </Field>
              )}

              <WriteError error={grantMutation.error || revokeMutation.error} />

              <Button
                variant="primary"
                className="mt-2 flex items-center justify-center gap-2"
                onClick={handleGrantRole}
                loading={grantMutation.isPending}
              >
                <UserPlus className="h-4 w-4" />
                <span>{t("grantRoleAction")}</span>
              </Button>
            </div>

            <div className="flex justify-end">
              <Button variant="ghost" onClick={() => setSelectedUser(null)}>
                {common("close")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
