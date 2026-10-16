"use client";

import type { PartyDto } from "@aptransit/shared";
import { useTranslations } from "next-intl";

/** D-051: "2 adults, 2 children, 1 senior citizen" and "Group of 5: ..." for a group ticket. */
export function usePartyText() {
  const t = useTranslations("tickets");
  const members = (party: Pick<PartyDto, "adults" | "children" | "seniors">) =>
    [
      party.adults ? t("partyAdults", { count: party.adults }) : null,
      party.children ? t("partyChildren", { count: party.children }) : null,
      party.seniors ? t("partySeniors", { count: party.seniors }) : null,
    ]
      .filter(Boolean)
      .join(", ");
  return {
    members,
    summary: (party: PartyDto) => t("party", { size: party.size, members: members(party) }),
  };
}
