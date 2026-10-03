import * as React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TripCard, type TripCardProps } from "./trip-card";

const base: TripCardProps = {
  departureTime: "06:30 AM",
  arrivalTime: "12:10 PM",
  duration: "5 h 40 min",
  serviceTypeName: "Express",
  destinationText: "to Vijayawada",
  seatsLeft: 22,
  seatsLeftText: "22 seats left",
  fareFormatted: "₹541",
  freeTravelLabel: "Free travel eligible",
  approxLabel: "approx.",
  fullLabel: "Full",
  label: "06:30 AM Express to Vijayawada, arrives 12:10 PM, 22 seats left, ₹541",
};

describe("TripCard", () => {
  it("renders with accessible link when seats are available", () => {
    render(<TripCard {...base} href="/bus/trip123" />);

    const link = screen.getByRole("link", {
      name: "06:30 AM Express to Vijayawada, arrives 12:10 PM, 22 seats left, ₹541",
    });
    expect(link).toHaveAttribute("href", "/bus/trip123");
    expect(link.className).toContain("focus-visible:ring-2");
    expect(screen.getByText("06:30 AM")).toBeInTheDocument();
    expect(screen.getByText("₹541")).toBeInTheDocument();
  });

  it("renders through a custom link component", () => {
    const CustomLink = React.forwardRef<HTMLAnchorElement, React.AnchorHTMLAttributes<HTMLAnchorElement>>(
      (props, ref) => <a ref={ref} data-custom="yes" {...props} />,
    );
    render(<TripCard {...base} href="/bus/trip123" linkAs={CustomLink} />);
    expect(screen.getByRole("link")).toHaveAttribute("data-custom", "yes");
  });

  it("renders non-clickable disabled state when full", () => {
    render(<TripCard {...base} seatsLeft={0} seatsLeftText="0 seats left" href="/bus/trip123" />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByRole("group")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Full")).toBeInTheDocument();
  });

  it("shows free travel eligible chip when freeTravelEligible is true", () => {
    render(<TripCard {...base} serviceTypeName="Pallevelugu" freeTravelEligible />);

    expect(screen.getByText("Free travel eligible")).toBeInTheDocument();
  });
});
