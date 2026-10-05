import * as React from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Countdown } from "./countdown";

const HOUR = 3_600_000;
const pad = (n: number) => String(n).padStart(2, "0");
const props = {
  format: (p: { days: number; hours: number; minutes: number; seconds: number; showSeconds: boolean }) =>
    p.showSeconds ? `${pad(p.hours)} h ${pad(p.minutes)} m ${pad(p.seconds)} s` : `${p.days} d ${pad(p.hours)} h ${pad(p.minutes)} m`,
  summary: (p: { days: number; hours: number; minutes: number }) => `${p.days} days ${p.hours} hours ${p.minutes} minutes left`,
  doneLabel: "Ended",
};

describe("Countdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T00:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("shows days, hours and minutes when more than a day is left", async () => {
    render(<Countdown until={Date.now() + 5 * 24 * HOUR + 8 * HOUR + 21 * 60_000} {...props} data-testid="c" />);
    await act(async () => vi.advanceTimersByTime(1));
    expect(screen.getByTestId("c")).toHaveTextContent("5 d 08 h 21 m");
    expect(screen.getByText("5 days 8 hours 21 minutes left")).toHaveClass("sr-only");
  });

  it("ticks every second under 24 hours, on its own", async () => {
    render(<Countdown until={Date.now() + 2 * HOUR + 10_000} {...props} data-testid="c" />);
    await act(async () => vi.advanceTimersByTime(1));
    expect(screen.getByTestId("c")).toHaveTextContent("02 h 00 m 10 s");
    await act(async () => vi.advanceTimersByTime(1_000));
    expect(screen.getByTestId("c")).toHaveTextContent("02 h 00 m 09 s");
  });

  it("says done at the end and stops", async () => {
    render(<Countdown until={Date.now() + 1_500} {...props} data-testid="c" />);
    await act(async () => vi.advanceTimersByTime(2_000));
    expect(screen.getByTestId("c")).toHaveTextContent("Ended");
    expect(vi.getTimerCount()).toBe(0);
  });
});
