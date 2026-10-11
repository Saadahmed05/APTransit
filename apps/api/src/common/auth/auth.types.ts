import type { Role } from "@aptransit/shared";

export interface AuthenticatedUserRole {
  role: Role;
  depotId?: string | null;
  districtId?: string | null;
  /** Set for STATE_ADMIN and TRANSPORT_OFFICER (D-034). */
  stateId?: string | null;
}

export interface AuthenticatedUser {
  id: string;
  roles: AuthenticatedUserRole[];
}
