"use client";

import * as React from "react";
import type { SeatLayout, SeatState } from "@aptransit/shared";
import { Ban, Check, Clock, ShipWheel, X } from "lucide-react";
import { cn } from "../cn";

export type SeatViewState = SeatState | "SELECTED";

export interface SeatMapLabels {
  /** Accessible name of the whole map, for example "Seats". */
  map: string;
  driver: string;
  /** Visible legend heading. */
  legend: string;
  states: Record<SeatViewState, string>;
  /** "Seat 18, available": built by the caller so word order follows the language. */
  seat: (seatNo: string, state: string) => string;
}

export interface SeatMapProps {
  layout: SeatLayout;
  seats: { seatNo: string; state: SeatState }[];
  selected: string[];
  onToggle: (seatNo: string) => void;
  /** Free seats cannot be added past this (booking.maxPassengers). Selected ones can still be removed. */
  maxSelectable: number;
  labels: SeatMapLabels;
  className?: string;
}

const STATE_STYLE: Record<SeatViewState, string> = {
  FREE: "border-strong bg-surface-raised text-fg hover:border-primary",
  SELECTED: "border-primary bg-primary text-on-primary",
  TAKEN: "border-default bg-surface text-subtle",
  HELD: "border-dashed border-status-warning bg-status-warning-soft text-status-warning",
  BLOCKED: "border-transparent bg-transparent text-subtle",
};

const STATE_ICON: Partial<Record<SeatViewState, typeof Check>> = {
  SELECTED: Check,
  TAKEN: X,
  HELD: Clock,
  BLOCKED: Ban,
};

function SeatGlyph({ state, seatNo }: { state: SeatViewState; seatNo?: string }) {
  const Icon = STATE_ICON[state];
  return (
    <span className="flex flex-col items-center leading-none">
      {Icon ? <Icon className="size-4" aria-hidden="true" /> : null}
      {seatNo !== undefined && <span className={cn("font-tabular text-caption", Icon && "mt-0.5")}>{seatNo}</span>}
    </span>
  );
}

/**
 * docs/09 SeatMap. Every seat is a button ("Seat 18, available") with aria-pressed when selected.
 * States differ by icon and border style as well as colour. Arrow keys move between seats with a
 * roving tab stop; Enter or Space toggles. The driver cabin is drawn above, the aisle as a gap.
 */
export function SeatMap({ layout, seats, selected, onToggle, maxSelectable, labels, className }: SeatMapProps) {
  const stateBySeat = React.useMemo(() => new Map(seats.map((s) => [s.seatNo, s.state])), [seats]);
  const selectedSet = React.useMemo(() => new Set(selected), [selected]);
  const buttons = React.useRef<(HTMLButtonElement | null)[]>([]);
  const [focusIndex, setFocusIndex] = React.useState(0);
  const atMax = selected.length >= maxSelectable;

  const viewState = (seatNo: string): SeatViewState => {
    const state = stateBySeat.get(seatNo) ?? "BLOCKED";
    if (state === "FREE" && selectedSet.has(seatNo)) return "SELECTED";
    return state;
  };

  const move = (from: number, rowStep: number, colStep: number) => {
    const row = Math.floor(from / layout.columns);
    const col = from % layout.columns;
    const nextRow = Math.min(layout.rows - 1, Math.max(0, row + rowStep));
    const nextCol = Math.min(layout.columns - 1, Math.max(0, col + colStep));
    const next = Math.min(layout.labels.length - 1, nextRow * layout.columns + nextCol);
    setFocusIndex(next);
    buttons.current[next]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const steps: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const step = steps[event.key];
    if (step) {
      event.preventDefault();
      move(index, step[0], step[1]);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const next = event.key === "Home" ? 0 : layout.labels.length - 1;
      setFocusIndex(next);
      buttons.current[next]?.focus();
    }
  };

  const rows = Array.from({ length: layout.rows }, (_, row) => row);

  const renderSeat = (index: number) => {
    const seatNo = layout.labels[index];
    if (seatNo === undefined) return <span key={`empty-${index}`} className="size-11" aria-hidden="true" />;
    const state = viewState(seatNo);
    const unavailable = state === "TAKEN" || state === "HELD" || state === "BLOCKED";
    const capped = state === "FREE" && atMax;
    return (
      <button
        key={seatNo}
        ref={(el) => {
          buttons.current[index] = el;
        }}
        type="button"
        tabIndex={index === focusIndex ? 0 : -1}
        aria-label={labels.seat(seatNo, labels.states[state])}
        aria-pressed={state === "SELECTED"}
        aria-disabled={unavailable || capped ? true : undefined}
        onFocus={() => setFocusIndex(index)}
        onKeyDown={(event) => onKeyDown(event, index)}
        onClick={() => {
          if (!unavailable && !capped) onToggle(seatNo);
        }}
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-md border-2 transition-colors duration-fast",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          STATE_STYLE[state],
          (unavailable || capped) && "cursor-not-allowed",
        )}
      >
        <SeatGlyph state={state} seatNo={state === "BLOCKED" ? undefined : seatNo} />
      </button>
    );
  };

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <div className="w-full max-w-sm rounded-xl border border-default bg-surface p-3">
        <div className="mb-3 flex items-center justify-end gap-2 border-b border-default pb-2 text-caption text-muted">
          <span>{labels.driver}</span>
          <ShipWheel className="size-6" aria-hidden="true" />
        </div>
        <div role="group" aria-label={labels.map} className="mx-auto flex w-fit flex-col gap-1.5">
          {rows.map((row) => (
            <div key={row} className="flex gap-1.5">
              {Array.from({ length: layout.columns }, (_, col) => (
                <React.Fragment key={col}>
                  {/* The aisle is a gap before aisleIndex */}
                  {col === layout.aisleIndex && <span className="w-4 shrink-0" aria-hidden="true" />}
                  {renderSeat(row * layout.columns + col)}
                </React.Fragment>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="w-full max-w-sm">
        <h3 className="mb-2 text-small font-semibold text-fg">{labels.legend}</h3>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(["FREE", "SELECTED", "TAKEN", "HELD", "BLOCKED"] as const).map((state) => (
            <li key={state} className="flex items-center gap-2 text-small text-muted">
              <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md border-2", STATE_STYLE[state])} aria-hidden="true">
                <SeatGlyph state={state} />
              </span>
              {labels.states[state]}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
