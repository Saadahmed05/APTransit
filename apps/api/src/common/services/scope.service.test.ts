import { describe, expect, it } from "vitest";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuthenticatedUser } from "../auth/auth.types";
import { AppError } from "../errors/app-error";
import { depotScopeWhere, ScopeService, wholeStates } from "./scope.service";

/** Two states (D-034): AP with Kurnool and Nandyal, TG with Hyderabad. */
const DISTRICTS = [
  { id: "dist_kurnool", stateId: "state_ap" },
  { id: "dist_nandyal", stateId: "state_ap" },
  { id: "dist_hyd", stateId: "state_tg" },
];
const DEPOTS = [
  { id: "depot_kurnool", districtId: "dist_kurnool" },
  { id: "depot_nandyal", districtId: "dist_nandyal" },
  { id: "depot_hyd", districtId: "dist_hyd" },
];
const prisma = {
  district: {
    findUnique: async ({ where }: { where: { id: string } }) => DISTRICTS.find((d) => d.id === where.id) ?? null,
  },
  depot: {
    findUnique: async ({ where }: { where: { id: string } }) => {
      const depot = DEPOTS.find((d) => d.id === where.id);
      return depot ? { districtId: depot.districtId, district: DISTRICTS.find((d) => d.id === depot.districtId)! } : null;
    },
  },
} as unknown as PrismaService;

describe("ScopeService", () => {
  const scopeService = new ScopeService(prisma);

  const kurnoolDepotManager: AuthenticatedUser = {
    id: "usr_dmg_kurnool",
    roles: [{ role: "DEPOT_MANAGER", depotId: "depot_kurnool", districtId: "dist_kurnool" }],
  };
  const kurnoolDistrictOfficer: AuthenticatedUser = {
    id: "usr_dof_kurnool",
    roles: [{ role: "DISTRICT_OFFICER", districtId: "dist_kurnool" }],
  };
  const superAdmin: AuthenticatedUser = { id: "usr_super_admin", roles: [{ role: "SUPER_ADMIN" }] };
  const apAdmin: AuthenticatedUser = { id: "usr_ap_admin", roles: [{ role: "STATE_ADMIN", stateId: "state_ap" }] };
  const tgTransport: AuthenticatedUser = { id: "usr_tg_officer", roles: [{ role: "TRANSPORT_OFFICER", stateId: "state_tg" }] };
  const unscopedAdmin: AuthenticatedUser = { id: "usr_no_state", roles: [{ role: "STATE_ADMIN" }] };
  const citizen: AuthenticatedUser = { id: "usr_citizen", roles: [{ role: "CITIZEN" }] };

  it("allows depot manager access to their own depot", async () => {
    await expect(scopeService.assertDepotAccess(kurnoolDepotManager, "depot_kurnool")).resolves.toBeUndefined();
  });

  it("throws 403 FORBIDDEN when depot manager accesses another depot (Nandyal)", async () => {
    const err = await scopeService.assertDepotAccess(kurnoolDepotManager, "depot_nandyal").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe("FORBIDDEN");
  });

  it("allows district officer access to their district and its depots only", async () => {
    await expect(scopeService.assertDistrictAccess(kurnoolDistrictOfficer, "dist_kurnool")).resolves.toBeUndefined();
    await expect(scopeService.assertDepotAccess(kurnoolDistrictOfficer, "depot_kurnool")).resolves.toBeUndefined();
    await expect(scopeService.assertDistrictAccess(kurnoolDistrictOfficer, "dist_nandyal")).rejects.toThrow(AppError);
  });

  it("allows super admin access across any depot, district and state", async () => {
    await expect(scopeService.assertDepotAccess(superAdmin, "depot_hyd")).resolves.toBeUndefined();
    await expect(scopeService.assertDistrictAccess(superAdmin, "dist_nandyal")).resolves.toBeUndefined();
    expect(() => scopeService.assertStateAccess(superAdmin, "state_tg")).not.toThrow();
  });

  it("keeps state roles inside their own state (D-034)", async () => {
    await expect(scopeService.assertDepotAccess(apAdmin, "depot_nandyal")).resolves.toBeUndefined();
    await expect(scopeService.assertDistrictAccess(apAdmin, "dist_kurnool")).resolves.toBeUndefined();
    await expect(scopeService.assertDepotAccess(apAdmin, "depot_hyd")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(scopeService.assertDistrictAccess(tgTransport, "dist_kurnool")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(scopeService.assertDistrictAccess(tgTransport, "dist_hyd")).resolves.toBeUndefined();
    expect(() => scopeService.assertStateAccess(apAdmin, "state_ap")).not.toThrow();
    expect(() => scopeService.assertStateAccess(apAdmin, "state_tg")).toThrow(AppError);
  });

  it("gives a state role without a state nothing", async () => {
    await expect(scopeService.assertDepotAccess(unscopedAdmin, "depot_kurnool")).rejects.toThrow(AppError);
    expect(depotScopeWhere(unscopedAdmin, "ops:read")).toEqual({ id: { in: [] } });
    expect(wholeStates(unscopedAdmin, "ops:read")).toEqual([]);
  });

  it("builds the depot filter per state and lists whole states", () => {
    expect(depotScopeWhere(apAdmin, "ops:read")).toEqual({ OR: [{ district: { stateId: "state_ap" } }] });
    expect(depotScopeWhere(superAdmin, "ops:read")).toEqual({});
    expect(wholeStates(superAdmin, "gov:read")).toBeNull();
    expect(wholeStates(tgTransport, "gov:read")).toEqual(["state_tg"]);
    expect(wholeStates(kurnoolDistrictOfficer, "gov:read")).toEqual([]);
  });

  it("denies citizen access to depot operations", async () => {
    await expect(scopeService.assertDepotAccess(citizen, "depot_kurnool")).rejects.toThrow(AppError);
  });
});
