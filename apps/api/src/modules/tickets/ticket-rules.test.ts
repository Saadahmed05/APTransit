import { describe, expect, it } from "vitest";
import { activationClosesAt, activationOpensAt, ticketValidUntil } from "./ticket-rules";

describe("ticket rules (docs/07 activation times)", () => {
  const boardingDepartureAt = new Date("2026-10-04T01:00:00.000Z"); // 06:30 IST

  it("opens activation 60 min before departure from the boarding stop", () => {
    expect(activationOpensAt({ boardingDepartureAt, delayMinutes: 0 }, 60).toISOString()).toBe("2026-10-04T00:00:00.000Z");
  });

  it("closes activation 30 min after departure plus the current delay", () => {
    expect(activationClosesAt({ boardingDepartureAt, delayMinutes: 0 }, 30).toISOString()).toBe("2026-10-04T01:30:00.000Z");
    expect(activationClosesAt({ boardingDepartureAt, delayMinutes: 15 }, 30).toISOString()).toBe("2026-10-04T01:45:00.000Z");
  });

  it("keeps a ticket valid until arrival plus delay plus grace", () => {
    const arrival = new Date("2026-10-04T06:40:00.000Z");
    expect(ticketValidUntil(arrival, 10, 60).toISOString()).toBe("2026-10-04T07:50:00.000Z");
  });
});
