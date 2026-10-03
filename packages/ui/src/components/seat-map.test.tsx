import * as React from "react";
import type { SeatLayout, SeatState } from "@aptransit/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SeatMap, type SeatMapLabels } from "./seat-map";
import { Stepper } from "./stepper";

const labels: SeatMapLabels = {
  map: "Seats",
  driver: "Driver",
  legend: "Legend",
  states: { FREE: "available", SELECTED: "selected", TAKEN: "taken", HELD: "held", BLOCKED: "blocked" },
  seat: (seatNo, state) => `Seat ${seatNo}, ${state}`,
};

// 2+2, three rows: seats 1 to 12
const layout: SeatLayout = {
  rows: 3,
  columns: 4,
  aisleIndex: 2,
  labels: Array.from({ length: 12 }, (_, i) => String(i + 1)),
  blockedCells: [],
};

function seats(overrides: Record<string, SeatState> = {}) {
  return layout.labels.map((seatNo) => ({ seatNo, state: overrides[seatNo] ?? ("FREE" as SeatState) }));
}

function Controlled({ max = 2, initial = [] as string[], states = {} as Record<string, SeatState> }) {
  const [selected, setSelected] = React.useState(initial);
  return (
    <SeatMap
      layout={layout}
      seats={seats(states)}
      selected={selected}
      maxSelectable={max}
      labels={labels}
      onToggle={(seatNo) => setSelected((s) => (s.includes(seatNo) ? s.filter((x) => x !== seatNo) : [...s, seatNo]))}
    />
  );
}

describe("SeatMap", () => {
  it("names every seat with its state and marks selection with aria-pressed", async () => {
    render(<Controlled states={{ "3": "TAKEN", "4": "HELD" }} />);
    expect(screen.getByRole("button", { name: "Seat 3, taken" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Seat 4, held" })).toHaveAttribute("aria-disabled", "true");

    await userEvent.click(screen.getByRole("button", { name: "Seat 1, available" }));
    expect(screen.getByRole("button", { name: "Seat 1, selected" })).toHaveAttribute("aria-pressed", "true");
  });

  it("does not toggle taken seats", async () => {
    const onToggle = vi.fn();
    render(<SeatMap layout={layout} seats={seats({ "3": "TAKEN" })} selected={[]} maxSelectable={6} labels={labels} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole("button", { name: "Seat 3, taken" }));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("stops at maxSelectable but still lets a selected seat go", async () => {
    render(<Controlled max={1} initial={["1"]} />);
    expect(screen.getByRole("button", { name: "Seat 2, available" })).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(screen.getByRole("button", { name: "Seat 2, available" }));
    expect(screen.getByRole("button", { name: "Seat 2, available" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(screen.getByRole("button", { name: "Seat 1, selected" }));
    expect(screen.getByRole("button", { name: "Seat 1, available" })).toBeInTheDocument();
  });

  it("has one tab stop and moves with the arrow keys; Space toggles", async () => {
    render(<Controlled />);
    const tabbable = screen.getAllByRole("button").filter((b) => b.getAttribute("tabindex") === "0");
    expect(tabbable).toHaveLength(1);

    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Seat 1, available" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "Seat 2, available" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: "Seat 6, available" })).toHaveFocus();
    await userEvent.keyboard(" ");
    expect(screen.getByRole("button", { name: "Seat 6, selected" })).toHaveFocus();
  });

  it("shows a legend with every state", () => {
    render(<Controlled />);
    for (const state of Object.values(labels.states)) {
      expect(screen.getByText(state)).toBeInTheDocument();
    }
  });
});

describe("Stepper", () => {
  it("marks the current step and announces it", () => {
    render(
      <Stepper
        steps={["Seat", "Details", "Pay"]}
        current={1}
        label="Booking steps"
        announcement="Step 2 of 3: Details"
        completedLabel="completed"
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[1]).toHaveAttribute("aria-current", "step");
    expect(items[0]).not.toHaveAttribute("aria-current");
    expect(items[0]).toHaveTextContent("Seat, completed");
    expect(screen.getByRole("status")).toHaveTextContent("Step 2 of 3: Details");
  });
});
