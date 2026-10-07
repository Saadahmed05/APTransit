import { can, type Permission, type Role } from "@aptransit/shared";
import { Injectable } from "@nestjs/common";
import type { Prisma } from "../../generated/prisma/client";
import type { AuthenticatedUser } from "../auth/auth.types";
import { AppError } from "../errors/app-error";

const STATEWIDE_ROLES: ReadonlySet<Role> = new Set([
  "SUPER_ADMIN",
  "STATE_ADMIN",
  "TRANSPORT_OFFICER",
]);

/**
 * Depots the caller may see for one permission (docs/08 "Roles and scope"). Only roles that hold
 * the permission count, so a depot role cannot widen a district role's reach or the other way.
 * Statewide roles get `{}`; a district officer gets every depot in their district; depot roles get
 * their depot. Throws FORBIDDEN when no role holds the permission.
 */
export function depotScopeWhere(
  user: AuthenticatedUser,
  permission: Permission,
): Prisma.DepotWhereInput {
  const roles = user.roles.filter((r) => can([r.role], permission));
  if (!roles.length) throw new AppError("FORBIDDEN", "Permission denied");
  if (roles.some((r) => STATEWIDE_ROLES.has(r.role))) return {};
  const or = roles.flatMap<Prisma.DepotWhereInput>((r) =>
    r.role === "DISTRICT_OFFICER" && r.districtId
      ? [{ districtId: r.districtId }]
      : r.depotId
        ? [{ id: r.depotId }]
        : [],
  );
  // A scoped role without a depot or district sees nothing rather than everything
  return or.length ? { OR: or } : { id: { in: [] } };
}

/** True when the permission comes from a statewide role (no depot filter needed). */
export function isStatewide(user: AuthenticatedUser, permission: Permission): boolean {
  return user.roles.some((r) => STATEWIDE_ROLES.has(r.role) && can([r.role], permission));
}

@Injectable()
export class ScopeService {
  /**
   * Asserts that the authenticated user has access to the specified depot.
   * Throws FORBIDDEN if the user does not have depot or statewide permissions.
   */
  assertDepotAccess(user: AuthenticatedUser, depotId: string): void {
    if (!user || !user.roles || user.roles.length === 0) {
      throw new AppError("FORBIDDEN", "Forbidden: depot access denied");
    }

    for (const userRole of user.roles) {
      if (STATEWIDE_ROLES.has(userRole.role)) {
        return;
      }
      if (userRole.depotId === depotId) {
        return;
      }
    }

    throw new AppError("FORBIDDEN", "Forbidden: depot access denied");
  }

  /**
   * Asserts that the authenticated user has access to the specified district.
   * Throws FORBIDDEN if the user does not have district or statewide permissions.
   */
  assertDistrictAccess(user: AuthenticatedUser, districtId: string): void {
    if (!user || !user.roles || user.roles.length === 0) {
      throw new AppError("FORBIDDEN", "Forbidden: district access denied");
    }

    for (const userRole of user.roles) {
      if (STATEWIDE_ROLES.has(userRole.role)) {
        return;
      }
      if (userRole.districtId === districtId) {
        return;
      }
    }

    throw new AppError("FORBIDDEN", "Forbidden: district access denied");
  }
}
