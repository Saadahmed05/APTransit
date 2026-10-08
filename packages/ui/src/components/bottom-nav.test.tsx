import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BottomNav } from "./bottom-nav";

const items = [
  {
    id: "today",
    href: "/driver",
    label: "Today",
    icon: <svg data-testid="icon-today" />,
    active: true,
  },
  { id: "trip", href: "/driver/trip", label: "Trip", icon: <svg /> },
  { id: "report", href: "/driver/report", label: "Report", icon: <svg /> },
  { id: "alerts", href: "/driver/alerts", label: "Alerts", icon: <svg /> },
  { id: "extra", href: "/driver/extra", label: "Extra", icon: <svg /> },
];

describe("BottomNav", () => {
  it("is a named navigation landmark", () => {
    render(<BottomNav label="Driver menu" items={items} />);
    expect(screen.getByRole("navigation", { name: "Driver menu" })).toBeInTheDocument();
  });

  it("shows a label for each item and caps the list at 4", () => {
    render(<BottomNav label="Driver menu" items={items} />);
    expect(screen.getAllByRole("link")).toHaveLength(4);
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute("href", "/driver");
    expect(screen.queryByRole("link", { name: "Extra" })).not.toBeInTheDocument();
  });

  it("marks only the current page with aria-current", () => {
    render(<BottomNav label="Driver menu" items={items} />);
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Trip" })).not.toHaveAttribute("aria-current");
  });

  it("gives every item a 56 px or taller touch target class", () => {
    render(<BottomNav label="Driver menu" items={items} />);
    for (const link of screen.getAllByRole("link")) expect(link.className).toContain("min-h-16");
  });

  it("uses the given link component", () => {
    const Custom = ({ href, children, ...rest }: React.ComponentProps<"a">) => (
      <a href={href} data-custom="yes" {...rest}>
        {children}
      </a>
    );
    render(<BottomNav label="Menu" items={items} linkAs={Custom} />);
    expect(screen.getByRole("link", { name: "Trip" })).toHaveAttribute("data-custom", "yes");
  });
});
