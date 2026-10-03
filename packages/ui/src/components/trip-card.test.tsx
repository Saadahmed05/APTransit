import * as React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TripCard } from "./trip-card";

describe("TripCard", () => {
  it("renders with accessible link when seats are available", () => {
    render(
      <TripCard
        departureTime="06:30 AM"
        arrivalTime="12:10 PM"
        duration="5 h 40 min"
        serviceTypeName="Express"
        destinationName="Vijayawada"
        seatsLeft={22}
        seatsLeftText="22 seats left"
        fareFormatted="₹541"
        href="/bus/trip123"
      />
    );

    const link = screen.getByRole("link", {
      name: /06:30 AM Express to Vijayawada, arrives 12:10 PM, 22 seats left, ₹541/i,
    });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/bus/trip123");
    expect(screen.getByText("06:30 AM")).toBeInTheDocument();
    expect(screen.getByText("₹541")).toBeInTheDocument();
  });

  it("renders non-clickable disabled state when full", () => {
    render(
      <TripCard
        departureTime="06:30 AM"
        arrivalTime="12:10 PM"
        duration="5 h 40 min"
        serviceTypeName="Express"
        destinationName="Vijayawada"
        seatsLeft={0}
        seatsLeftText="0 seats left"
        fullLabel="Full"
        fareFormatted="₹541"
        href="/bus/trip123"
      />
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Full")).toBeInTheDocument();
  });

  it("shows free travel eligible chip when freeTravelEligible is true", () => {
    render(
      <TripCard
        departureTime="07:00 AM"
        arrivalTime="01:00 PM"
        duration="6 h"
        serviceTypeName="Pallevelugu"
        destinationName="Kurnool"
        seatsLeft={15}
        seatsLeftText="15 seats left"
        fareFormatted="₹320"
        freeTravelEligible={true}
        freeTravelLabel="Free travel eligible"
      />
    );

    expect(screen.getByText("Free travel eligible")).toBeInTheDocument();
  });
});
