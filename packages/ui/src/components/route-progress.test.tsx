import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RouteProgress } from "./route-progress";
describe("RouteProgress", () => {
  it("carries the decorative map facts and announces the current stop", () => {
    const labels = {
      done: "Done",
      current: "Current",
      upcoming: "Upcoming",
      delay: (n: number) => n + " min late",
      incident: "Breakdown",
    };
    const stops = [
      { stopId: "a", name: "Origin", state: "DONE" as const, eta: null },
      { stopId: "b", name: "Next stop", state: "CURRENT" as const, eta: "12:30" },
      { stopId: "c", name: "Destination", state: "UPCOMING" as const, eta: "13:00" },
    ];
    const view = render(<RouteProgress stops={stops} labels={labels} delayMinutes={12} incident />);
    expect(screen.getByRole("status")).toHaveTextContent("Current: Next stop");
    expect(screen.getByText("12 min late")).toBeVisible();
    expect(screen.getByText("Breakdown")).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    view.rerender(
      <RouteProgress
        stops={stops.map((s) => ({ ...s, state: s.stopId === "c" ? "CURRENT" : "DONE" }))}
        labels={labels}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Current: Destination");
  });
});
