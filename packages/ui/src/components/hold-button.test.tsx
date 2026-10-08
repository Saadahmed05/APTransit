import * as React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOLD_MS, HoldButton } from "./hold-button";

function setup(onComplete = vi.fn()) {
  render(
    <HoldButton
      label="Hold for SOS"
      holdingLabel="Keep holding"
      hint="Press and hold for 3 seconds to send an emergency alert"
      onComplete={onComplete}
    />,
  );
  return { button: screen.getByRole("button"), onComplete };
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("HoldButton", () => {
  it("explains the gesture to a screen reader", () => {
    const { button } = setup();
    expect(button).toHaveAccessibleDescription(
      "Press and hold for 3 seconds to send an emergency alert",
    );
    expect(button).toHaveTextContent("Hold for SOS");
  });

  it("completes once after a full 3 second press", () => {
    const { button, onComplete } = setup();
    fireEvent.pointerDown(button, { button: 0 });
    expect(button).toHaveTextContent("Keep holding");
    advance(HOLD_MS - 1);
    expect(onComplete).not.toHaveBeenCalled();
    advance(1);
    expect(onComplete).toHaveBeenCalledOnce();
    expect(button).toHaveTextContent("Hold for SOS");
  });

  it("cancels when released early", () => {
    const { button, onComplete } = setup();
    fireEvent.pointerDown(button, { button: 0 });
    advance(2000);
    fireEvent.pointerUp(button);
    advance(5000);
    expect(onComplete).not.toHaveBeenCalled();
    expect(button).toHaveTextContent("Hold for SOS");
  });

  it("cancels when the pointer leaves the button", () => {
    const { button, onComplete } = setup();
    fireEvent.pointerDown(button, { button: 0 });
    fireEvent.pointerLeave(button);
    advance(HOLD_MS);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("ignores a right click", () => {
    const { button, onComplete } = setup();
    // jsdom has no PointerEvent: a MouseEvent named pointerdown carries the real button number
    fireEvent(button, new MouseEvent("pointerdown", { bubbles: true, button: 2 }));
    advance(HOLD_MS);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("completes when Space is held, and key repeat does not restart it", () => {
    const { button, onComplete } = setup();
    fireEvent.keyDown(button, { key: " " });
    advance(1500);
    fireEvent.keyDown(button, { key: " ", repeat: true });
    advance(1500);
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("completes when Enter is held", () => {
    const { button, onComplete } = setup();
    fireEvent.keyDown(button, { key: "Enter" });
    advance(HOLD_MS);
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("cancels when a key is released early", () => {
    const { button, onComplete } = setup();
    fireEvent.keyDown(button, { key: " " });
    advance(1000);
    fireEvent.keyUp(button, { key: " " });
    advance(HOLD_MS);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("cancels when focus leaves", () => {
    const { button, onComplete } = setup();
    fireEvent.keyDown(button, { key: " " });
    fireEvent.blur(button);
    advance(HOLD_MS);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("does nothing when disabled", () => {
    const onComplete = vi.fn();
    render(
      <HoldButton
        label="Hold"
        holdingLabel="Keep holding"
        hint="hint"
        onComplete={onComplete}
        disabled
      />,
    );
    fireEvent.pointerDown(screen.getByRole("button"), { button: 0 });
    advance(HOLD_MS);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("announces the holding state in a live region", () => {
    const { button } = setup();
    fireEvent.pointerDown(button, { button: 0 });
    expect(screen.getByRole("status")).toHaveTextContent("Keep holding");
  });
});
