import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { KpiTile } from "./kpi-tile";
it("shows label, value and accessible delta link", () => {
  render(
    <KpiTile
      label="Trips"
      value={12}
      href="/trips"
      delta={{ label: "Up 2", tone: "success", icon: <span aria-hidden="true">+</span> }}
    />,
  );
  expect(screen.getByRole("link")).toHaveAttribute("href", "/trips");
  expect(screen.getByText("12")).toBeVisible();
  expect(screen.getByText("Up 2")).toBeVisible();
});
it("reserves loading value space", () => {
  const { container } = render(<KpiTile label="Trips" value={0} loading />);
  expect(container.firstChild).toHaveAttribute("aria-busy", "true");
  expect(screen.queryByText("0")).toBeNull();
});
