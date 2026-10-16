import { describe, expect, it } from "vitest";
import { groupTickets, partyOf, type PartyTicket } from "./party";

const ticket = (id: string, over: Partial<PartyTicket> = {}): PartyTicket => ({
  id,
  bookingId: "booking0001",
  tripId: "trip0001",
  holderUserId: "user0001",
  status: "BOOKED",
  farePaise: 5000,
  passenger: { category: "ADULT" },
  ...over,
});

describe("group tickets (D-051)", () => {
  it("shows a family of five as one ticket with its party", () => {
    const family = [
      ticket("t3", { passenger: { category: "CHILD" }, farePaise: 2500 }),
      ticket("t1"),
      ticket("t2"),
      ticket("t4", { passenger: { category: "CHILD" }, farePaise: 2500 }),
      ticket("t5", { passenger: { category: "SENIOR" }, farePaise: 2500 }),
    ];
    const groups = groupTickets(family);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.lead.id).toBe("t1");
    expect(partyOf(groups[0]!.members)).toEqual({ size: 5, adults: 2, children: 2, seniors: 1, totalPaise: 17500 });
  });

  it("keeps a gifted ticket, another trip or another state apart", () => {
    const groups = groupTickets([
      ticket("t1"),
      ticket("t2", { holderUserId: "friend001" }),
      ticket("t3", { tripId: "trip0002" }),
      ticket("t4", { status: "CANCELLED" }),
      ticket("t5", { bookingId: null }),
    ]);
    expect(groups).toHaveLength(5);
    expect(groups.every((g) => partyOf(g.members) === null)).toBe(true);
  });
});
