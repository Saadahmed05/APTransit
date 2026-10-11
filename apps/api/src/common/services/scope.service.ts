import { can, type Permission, type Role } from "@aptransit/shared";
import { Injectable } from "@nestjs/common";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuthenticatedUser, AuthenticatedUserRole } from "../auth/auth.types";
import { AppError } from "../errors/app-error";

/** Sees every state (docs/08, D-034). */
export const PLATFORM_ROLES: ReadonlySet<Role> = new Set(["SUPER_ADMIN"]);
/** Sees one whole state, the role's stateId. Without a stateId the role sees nothing. */
export const STATE_ROLES: ReadonlySet<Role> = new Set(["STATE_ADMIN", "TRANSPORT_OFFICER"]);

function rolesFor(user: AuthenticatedUser, permission: Permission): AuthenticatedUserRole[] {
  const roles = user.roles.filter((r) => can([r.role], permission));
  if (!roles.length) throw new AppError("FORBIDDEN", "Permission denied");
  return roles;
}

/**
 * Depots the caller may see for one permission (docs/08 "Roles and scope"). Only roles that hold
 * the permission count, so a depot role cannot widen a district role's reach or the other way.
 * SUPER_ADMIN gets `{}`; state roles get every depot of their state; a district officer gets every
 * depot in their district; depot roles get their depot. Throws FORBIDDEN when no role holds the
 * permission.
 */
export function depotScopeWhere(
  user: AuthenticatedUser,
  permission: Permission,
): Prisma.DepotWhereInput {
  const roles = rolesFor(user, permission);
  if (roles.some((r) => PLATFORM_ROLES.has(r.role))) return {};
  const or = roles.flatMap<Prisma.DepotWhereInput>((r) =>
    STATE_ROLES.has(r.role)
      ? r.stateId
        ? [{ district: { stateId: r.stateId } }]
        : []
      : r.role === "DISTRICT_OFFICER" && r.districtId
        ? [{ districtId: r.districtId }]
        : r.depotId
          ? [{ id: r.depotId }]
          : [],
  );
  // A scoped role without a depot, district or state sees nothing rather than everything
  return or.length ? { OR: or } : { id: { in: [] } };
}

/** True when the permission comes from a platform wide role (no filter at all). */
export function isPlatformWide(user: AuthenticatedUser, permission: Permission): boolean {
  return user.roles.some((r) => PLATFORM_ROLES.has(r.role) && can([r.role], permission));
}

/** States the caller sees whole for the permission: every state (null) or a list (maybe empty). */
export function wholeStates(user: AuthenticatedUser, permission: Permission): string[] | null {
  if (isPlatformWide(user, permission)) return null;
  return [
    ...new Set(
      user.roles.flatMap((r) =>
        STATE_ROLES.has(r.role) && r.stateId && can([r.role], permission) ? [r.stateId] : [],
      ),
    ),
  ];
}

/** True for SUPER_ADMIN, STATE_ADMIN and TRANSPORT_OFFICER (any role above district level). */
export function hasStateLevelRole(roles: readonly AuthenticatedUserRole[]): boolean {
  return roles.some((r) => PLATFORM_ROLES.has(r.role) || STATE_ROLES.has(r.role));
}

@Injectable()
export class ScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /** SUPER_ADMIN, or a state role on this state. Throws FORBIDDEN otherwise. */
  assertStateAccess(user: AuthenticatedUser, stateId: string): void {
    if (this.reachesState(user, stateId)) return;
    throw new AppError("FORBIDDEN", "Forbidden: state access denied");
  }

  /** A role on the district, on its state, or platform wide. Throws FORBIDDEN otherwise. */
  async assertDistrictAccess(user: AuthenticatedUser, districtId: string): Promise<void> {
    const roles = user?.roles ?? [];
    if (roles.some((r) => PLATFORM_ROLES.has(r.role) || r.districtId === districtId)) return;
    if (roles.some((r) => STATE_ROLES.has(r.role) && r.stateId)) {
      const district = await this.prisma.district.findUnique({
        where: { id: districtId },
        select: { stateId: true },
      });
      if (district && this.reachesState(user, district.stateId)) return;
    }
    throw new AppError("FORBIDDEN", "Forbidden: district access denied");
  }

  /** A role on the depot, on its district, on its state, or platform wide. Throws FORBIDDEN otherwise. */
  async assertDepotAccess(user: AuthenticatedUser, depotId: string): Promise<void> {
    const roles = user?.roles ?? [];
    if (roles.some((r) => PLATFORM_ROLES.has(r.role) || r.depotId === depotId)) return;
    if (roles.some((r) => r.districtId || (STATE_ROLES.has(r.role) && r.stateId))) {
      const depot = await this.prisma.depot.findUnique({
        where: { id: depotId },
        select: { districtId: true, district: { select: { stateId: true } } },
      });
      if (
        depot &&
        (roles.some((r) => r.districtId === depot.districtId) ||
          this.reachesState(user, depot.district.stateId))
      )
        return;
    }
    throw new AppError("FORBIDDEN", "Forbidden: depot access denied");
  }

  private reachesState(user: AuthenticatedUser, stateId: string): boolean {
    return (user?.roles ?? []).some(
      (r) => PLATFORM_ROLES.has(r.role) || (STATE_ROLES.has(r.role) && r.stateId === stateId),
    );
  }
}
