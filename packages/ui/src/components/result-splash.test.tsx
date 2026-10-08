import * as React from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RESULT_RESET_MS, ResultSplash } from "./result-splash";

afterEach(() => {
  vi.useRealTimers();
});

describe("ResultSplash", () => {
  it("announces VALID as a status", () => {
    render(<ResultSplash tone="success" label="Valid" reason="Seat 18" icon={<svg />} />);
    const splash = screen.getByRole("status");
    expect(splash).toHaveTextContent("Valid");
    expect(splash).toHaveTextContent("Seat 18");
  });

  it("announces a rejection as an alert", () => {
    render(
      <ResultSplash tone="danger" label="Already used" reason="Scanned at 08:12" icon={<svg />} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Already used");
  });

  it("shows the detail line", () => {
    render(<ResultSplash tone="success" label="Valid" detail="2 of 4 boarded" icon={<svg />} />);
    expect(screen.getByText("2 of 4 boarded")).toBeInTheDocument();
  });

  it("resets after 3 seconds, not before", () => {
    vi.useFakeTimers();
    const onReset = vi.fn();
    render(<ResultSplash tone="success" label="Valid" icon={<svg />} onReset={onReset} />);
    act(() => {
      vi.advanceTimersByTime(RESULT_RESET_MS - 1);
    });
    expect(onReset).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onReset).toHaveBeenCalledOnce();
  });

  it("stays on screen without onReset", () => {
    vi.useFakeTimers();
    render(<ResultSplash tone="danger" label="Expired" icon={<svg />} />);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("does not reset after it was removed", () => {
    vi.useFakeTimers();
    const onReset = vi.fn();
    const { unmount } = render(
      <ResultSplash tone="success" label="Valid" icon={<svg />} onReset={onReset} />,
    );
    unmount();
    act(() => {
      vi.advanceTimersByTime(RESULT_RESET_MS);
    });
    expect(onReset).not.toHaveBeenCalled();
  });
});
