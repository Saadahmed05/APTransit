import type { PartyDto, TicketStatus } from "@aptransit/shared";

/**
 * D-051 group tickets: the tickets of one booking that one holder has on one trip travel as one
 * group. The citizen sees one ticket and one QR (the lead, the lowest id), activation and cancel
 * act on all of them, and one scan boards them all. Each traveller keeps a ticket row underneath
 * (fare share, refund, manifest and alighting counts). A gifted ticket has another holder, so it
 * leaves the group and keeps its own QR.
 */
export interface PartyTicket {
  id: string;
  bookingId: string | null;
  tripId: string;
  holderUserId: string;
  status: TicketStatus;
  farePaise: number;
  passenger: { category: "ADULT" | "CHILD" | "SENIOR" } | null;
}

/**
 * Tickets with the same key are one group. The status is part of the key: a group is activated,
 * scanned and cancelled together, so a ticket in another state is not travelling with it.
 */
export function partyKey(t: PartyTicket): string {
  if (!t.bookingId) return t.id;
  return `${t.bookingId}|${t.tripId}|${t.holderUserId}|${t.status}`;
}

/** Groups tickets; the lead of each group is the ticket with the lowest id. */
export function groupTickets<T extends PartyTicket>(tickets: readonly T[]): { lead: T; members: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const t of tickets) groups.set(partyKey(t), [...(groups.get(partyKey(t)) ?? []), t]);
  return [...groups.values()].map((members) => {
    const sorted = [...members].sort((a, b) => a.id.localeCompare(b.id));
    return { lead: sorted[0]!, members: sorted };
  });
}

/** The party of a group of two or more, else null (a single ticket stays a single ticket). */
export function partyOf(members: readonly PartyTicket[]): PartyDto | null {
  if (members.length < 2) return null;
  const count = (c: "ADULT" | "CHILD" | "SENIOR") => members.filter((m) => (m.passenger?.category ?? "ADULT") === c).length;
  return {
    size: members.length,
    adults: count("ADULT"),
    children: count("CHILD"),
    seniors: count("SENIOR"),
    totalPaise: members.reduce((sum, m) => sum + m.farePaise, 0),
  };
}

/** The prisma filter for the other members of a ticket's group. */
export function siblingsWhere(t: PartyTicket) {
  return {
    id: { not: t.id },
    bookingId: t.bookingId ?? "none",
    tripId: t.tripId,
    holderUserId: t.holderUserId,
    status: t.status,
  };
}
