"use client";

import * as React from "react";
import { ArrowRight, Check, Copy } from "lucide-react";
import { cn } from "../cn";

export interface TicketCardDetail {
  label: string;
  value: React.ReactNode;
  /** Wide values (a stop name) take the full row on small screens. */
  wide?: boolean;
}

export interface TicketCardProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  from: string;
  to: string;
  /** Read by screen readers for the arrow between From and To ("Kurnool to Vijayawada"). */
  routeLabel: string;
  /** Date and departure time, already formatted ("Tue, 23 Sep, 06:30 AM"). */
  when: string;
  /** TicketStatusBadge. */
  status: React.ReactNode;
  details: TicketCardDetail[];
  code: string;
  codeLabel: string;
  copyLabel: string;
  copiedLabel: string;
  /** The bottom block below the perforation: the QR, or the locked or ended state. */
  children?: React.ReactNode;
  headingLevel?: "h1" | "h2";
}

/**
 * Full ticket (plan sec 12, docs/09 TicketCard): a top block with route and time, a perforation,
 * and a bottom block with the QR area. Radius xl, a border, no heavy shadow. Text comes in as props.
 */
export const TicketCard = React.forwardRef<HTMLElement, TicketCardProps>(
  (
    { from, to, routeLabel, when, status, details, code, codeLabel, copyLabel, copiedLabel, children, headingLevel = "h1", className, ...props },
    ref,
  ) => {
    const Heading = headingLevel;
    const [copied, setCopied] = React.useState(false);

    React.useEffect(() => {
      if (!copied) return;
      const id = window.setTimeout(() => setCopied(false), 2_000);
      return () => window.clearTimeout(id);
    }, [copied]);

    const copy = async () => {
      try {
        await navigator.clipboard.writeText(code);
        setCopied(true);
      } catch {
        // Clipboard blocked: the code stays visible and selectable
      }
    };

    return (
      <article ref={ref} className={cn("overflow-hidden rounded-xl border border-default bg-surface-raised", className)} {...props}>
        <div className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <Heading className="flex min-w-0 flex-wrap items-center gap-2 text-h2 text-fg">
              <span className="sr-only">{routeLabel}</span>
              <span aria-hidden="true" className="break-words">
                {from}
              </span>
              <ArrowRight className="size-5 shrink-0 text-muted" aria-hidden="true" />
              <span aria-hidden="true" className="break-words">
                {to}
              </span>
            </Heading>
            {status}
          </div>
          <p className="text-display tabular-nums text-fg">{when}</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            {details.map((detail) => (
              <div key={detail.label} className={cn("min-w-0", detail.wide && "col-span-2 sm:col-span-1")}>
                <dt className="text-caption text-muted">{detail.label}</dt>
                <dd className="text-body font-medium text-fg">{detail.value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-caption text-muted">{codeLabel}</span>
            <span className="font-mono text-body text-fg">{code}</span>
            <button
              type="button"
              onClick={() => void copy()}
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-md px-2 text-small text-primary transition-colors duration-fast hover:bg-surface"
            >
              {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
              <span>{copied ? copiedLabel : copyLabel}</span>
            </button>
            <span className="sr-only" role="status">
              {copied ? copiedLabel : ""}
            </span>
          </div>
        </div>

        {/* Perforation: a dashed line between two notches, like a paper ticket */}
        <div className="relative flex items-center" aria-hidden="true">
          <span className="absolute -left-3 size-6 rounded-full border border-default bg-bg" />
          <span className="mx-4 w-full border-t-2 border-dashed border-default" />
          <span className="absolute -right-3 size-6 rounded-full border border-default bg-bg" />
        </div>

        <div className="flex flex-col items-center gap-4 p-5">{children}</div>
      </article>
    );
  },
);
TicketCard.displayName = "TicketCard";
