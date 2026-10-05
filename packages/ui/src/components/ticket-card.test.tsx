import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TicketCard } from "./ticket-card";

const props = {
  from: "Kurnool",
  to: "Vijayawada",
  routeLabel: "Kurnool to Vijayawada",
  when: "Tue, 23 Sep, 06:30 AM",
  status: <span>Not active</span>,
  details: [
    { label: "Seat", value: "18" },
    { label: "Boarding point", value: "Kurnool Bus Stand", wide: true },
  ],
  code: "APT-7K3M-Q9XD",
  codeLabel: "Ticket code",
  copyLabel: "Copy code",
  copiedLabel: "Copied",
};

describe("TicketCard", () => {
  it("names the route once for screen readers and lists the details", () => {
    render(<TicketCard {...props}>QR area</TicketCard>);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Kurnool to Vijayawada");
    expect(screen.getByText("Seat").nextSibling).toHaveTextContent("18");
    expect(screen.getByText("QR area")).toBeInTheDocument();
  });

  it("copies the ticket code and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<TicketCard {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Copy code" }));
    expect(writeText).toHaveBeenCalledWith("APT-7K3M-Q9XD");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });
});
