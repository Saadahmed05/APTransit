import * as React from "react";
import { render, screen } from "@testing-library/react";
import { Wifi } from "lucide-react";
import { describe, expect, it } from "vitest";
import { StatusChip } from "./status-chip";

describe("StatusChip", () => {
  it("shows the label and an icon, never colour alone", () => {
    render(<StatusChip tone="success" label="Online" icon={Wifi} data-testid="chip" />);
    const chip = screen.getByTestId("chip");
    expect(chip).toHaveTextContent("Online");
    expect(chip.querySelector("svg")).toBeInTheDocument();
  });

  it("uses the soft tone background", () => {
    render(<StatusChip tone="warning" label="GPS weak" icon={Wifi} data-testid="chip" />);
    expect(screen.getByTestId("chip").className).toContain("bg-status-warning-soft");
  });

  it("is a live region only when asked", () => {
    const { rerender } = render(
      <StatusChip tone="info" label="On trip" icon={Wifi} data-testid="chip" />,
    );
    expect(screen.getByTestId("chip")).not.toHaveAttribute("role");
    rerender(<StatusChip tone="info" label="On trip" icon={Wifi} live data-testid="chip" />);
    expect(screen.getByRole("status")).toHaveTextContent("On trip");
  });
});
