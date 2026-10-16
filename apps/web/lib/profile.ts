import type { MeDto } from "@aptransit/shared";
import { rolesOf } from "./roles";

// D-048: a citizen needs a name, a verified email and a phone before using the app.
// Staff accounts are created by an admin and are never sent to the welcome screen.

export function needsProfile(me: Pick<MeDto, "roles" | "profileComplete"> | null | undefined): boolean {
  if (!me || me.profileComplete) return false;
  return rolesOf(me).every((role) => role === "CITIZEN");
}

export function welcomeHref(next: string | null | undefined): string {
  return next && next !== "/" && next !== "/welcome" ? `/welcome?next=${encodeURIComponent(next)}` : "/welcome";
}
