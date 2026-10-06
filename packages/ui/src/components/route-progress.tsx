"use client";
import { CircleCheck, CircleDashed, MapPin, Timer, TriangleAlert } from "lucide-react";
import { ToneChip } from "./status-badge";
export interface ProgressStop {
  stopId: string;
  name: string;
  state: "DONE" | "CURRENT" | "UPCOMING";
  eta: string | null;
}
export function RouteProgress({
  stops,
  labels,
  delayMinutes = 0,
  incident = false,
}: {
  stops: ProgressStop[];
  labels: {
    done: string;
    current: string;
    upcoming: string;
    delay: (n: number) => string;
    incident: string;
  };
  delayMinutes?: number;
  incident?: boolean;
}) {
  const current = stops.find((s) => s.state === "CURRENT");
  return (
    <div className="flex flex-col gap-3">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {current ? labels.current + ": " + current.name : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        {delayMinutes >= 5 && (
          <ToneChip tone="warning" icon={Timer} label={labels.delay(delayMinutes)} />
        )}{" "}
        {incident && <ToneChip tone="danger" icon={TriangleAlert} label={labels.incident} />}
      </div>
      <ol className="flex flex-col" data-testid="route-progress">
        {stops.map((s) => {
          const Icon =
            s.state === "DONE" ? CircleCheck : s.state === "CURRENT" ? MapPin : CircleDashed;
          return (
            <li
              key={s.stopId}
              aria-current={s.state === "CURRENT" ? "step" : undefined}
              className={
                s.state === "DONE"
                  ? "flex min-w-0 gap-3 border-l border-status-success py-3 pl-4"
                  : s.state === "CURRENT"
                    ? "flex min-w-0 gap-3 border-l border-status-info py-3 pl-4"
                    : "flex min-w-0 gap-3 border-l border-dashed border-default py-3 pl-4"
              }
            >
              <Icon
                aria-hidden="true"
                className={
                  s.state === "DONE"
                    ? "size-5 shrink-0 text-status-success"
                    : s.state === "CURRENT"
                      ? "size-5 shrink-0 text-status-info"
                      : "size-5 shrink-0 text-muted"
                }
              />
              <div className="min-w-0">
                <p
                  className={
                    s.state === "DONE"
                      ? "text-body text-muted"
                      : s.state === "CURRENT"
                        ? "text-body font-semibold text-fg"
                        : "text-body text-fg"
                  }
                >
                  {s.name}
                </p>
                <p className="text-small text-muted">
                  {s.state === "DONE"
                    ? labels.done
                    : s.state === "CURRENT"
                      ? labels.current
                      : labels.upcoming}
                  {s.eta && s.state !== "DONE" ? ", " + s.eta : ""}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
