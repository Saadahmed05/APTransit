"use client";

// TODO(Day 3): temporary Day 1 token check page. Delete it when /design exists.
// Hardcoded English and Telugu samples are allowed here only (prompts/day-01.md).

import { colourOfDay, type StatusTone } from "@aptransit/shared";
import { cn } from "@aptransit/ui";
import { type ReactNode, useMemo, useState, useSyncExternalStore } from "react";
import { PrimitivesShowcase } from "./primitives-showcase";

type ThemeChoice = "light" | "dark" | "system";

const COLOUR_GROUPS: { title: string; tokens: { name: string; className: string }[] }[] = [
  {
    title: "Surfaces and borders",
    tokens: [
      { name: "--bg", className: "bg-bg" },
      { name: "--surface", className: "bg-surface" },
      { name: "--surface-raised", className: "bg-surface-raised" },
      { name: "--border", className: "bg-default" },
      { name: "--border-strong", className: "bg-strong" },
    ],
  },
  {
    title: "Text",
    tokens: [
      { name: "--text", className: "bg-fg" },
      { name: "--text-muted", className: "bg-muted" },
      { name: "--text-subtle", className: "bg-subtle" },
    ],
  },
  {
    title: "Brand",
    tokens: [
      { name: "--primary", className: "bg-primary" },
      { name: "--primary-hover", className: "bg-primary-hover" },
      { name: "--primary-soft", className: "bg-primary-soft" },
      { name: "--on-primary", className: "bg-on-primary" },
    ],
  },
];

const TONES: Record<StatusTone, { example: string; soft: string; solid: string }> = {
  success: {
    example: "Completed",
    soft: "bg-status-success-soft text-status-success",
    solid: "bg-status-success-solid text-on-solid",
  },
  info: {
    example: "Running",
    soft: "bg-status-info-soft text-status-info",
    solid: "bg-status-info-solid text-on-solid",
  },
  warning: {
    example: "Delayed",
    soft: "bg-status-warning-soft text-status-warning",
    solid: "bg-status-warning-solid text-on-solid",
  },
  danger: {
    example: "Incident",
    soft: "bg-status-danger-soft text-status-danger",
    solid: "bg-status-danger-solid text-on-solid",
  },
  maintenance: {
    example: "Maintenance",
    soft: "bg-status-maintenance-soft text-status-maintenance",
    solid: "bg-status-maintenance-solid text-on-solid",
  },
  neutral: {
    example: "Upcoming",
    soft: "bg-status-neutral-soft text-status-neutral",
    solid: "bg-status-neutral-solid text-on-solid",
  },
};

const DAYS = [
  { day: "Monday", colour: "Blue", key: "BLUE", className: "bg-day-mon" },
  { day: "Tuesday", colour: "Green", key: "GREEN", className: "bg-day-tue" },
  { day: "Wednesday", colour: "Violet", key: "VIOLET", className: "bg-day-wed" },
  { day: "Thursday", colour: "Amber", key: "AMBER", className: "bg-day-thu" },
  { day: "Friday", colour: "Teal", key: "TEAL", className: "bg-day-fri" },
  { day: "Saturday", colour: "Pink", key: "PINK", className: "bg-day-sat" },
  { day: "Sunday", colour: "Red", key: "RED", className: "bg-day-sun" },
];

const TYPE_SCALE = [
  { token: "display", className: "text-display", spec: "36 / 44 · 600" },
  { token: "h1", className: "text-h1", spec: "28 / 36 · 600" },
  { token: "h2", className: "text-h2", spec: "22 / 30 · 600" },
  { token: "h3", className: "text-h3", spec: "18 / 26 · 600" },
  { token: "body-lg", className: "text-body-lg", spec: "17 / 26 · 400" },
  { token: "body", className: "text-body", spec: "16 / 24 · 400" },
  { token: "small", className: "text-small", spec: "14 / 20 · 400" },
  { token: "caption", className: "text-caption", spec: "12 / 16 · 500" },
];

const SPACING = [
  { px: 4, className: "w-1" },
  { px: 8, className: "w-2" },
  { px: 12, className: "w-3" },
  { px: 16, className: "w-4" },
  { px: 20, className: "w-5" },
  { px: 24, className: "w-6" },
  { px: 32, className: "w-8" },
  { px: 40, className: "w-10" },
  { px: 48, className: "w-12" },
  { px: 64, className: "w-16" },
];

const RADII = [
  { name: "sm 6", className: "rounded-sm" },
  { name: "md 10", className: "rounded-md" },
  { name: "lg 14", className: "rounded-lg" },
  { name: "xl 20", className: "rounded-xl" },
  { name: "full", className: "rounded-full" },
];

const SHADOWS = [
  { name: "sm", use: "Sticky bars", className: "shadow-sm" },
  { name: "md", use: "Popovers, sheets", className: "shadow-md" },
  { name: "lg", use: "Dialogs", className: "shadow-lg" },
];

const EN_SAMPLE = "Where do you want to go?";
const TE_SAMPLE = "మీరు ఎక్కడికి వెళ్లాలనుకుంటున్నారు?";

/** Reads a CSS variable and shows it as 6 digit hex (the CSS minifier shortens #ffffff to #fff). */
function readToken(name: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim().toUpperCase();
  const short = /^#([0-9A-F])([0-9A-F])([0-9A-F])$/.exec(raw);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : raw;
}

const TOKEN_NAMES = COLOUR_GROUPS.flatMap((group) => group.tokens.map((token) => token.name));

/** Re-read tokens when the OS theme changes or when data-theme on html changes. */
function subscribeToTheme(onChange: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => {
    media.removeEventListener("change", onChange);
    observer.disconnect();
  };
}

/** A string snapshot keeps useSyncExternalStore stable between renders. */
function readAllTokens(): string {
  return TOKEN_NAMES.map((name) => `${name}=${readToken(name)}`).join(";");
}

const noSubscription = () => () => undefined;

function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
}

function ThemeSwitch({ value, onChange }: { value: ThemeChoice; onChange: (next: ThemeChoice) => void }) {
  const options: { value: ThemeChoice; label: string }[] = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "System" },
  ];
  return (
    <div role="group" aria-label="Theme" className="inline-flex gap-1 rounded-md border border-strong p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-11 rounded-sm px-4 text-small font-medium transition-colors duration-fast ease-out",
            value === option.value ? "bg-primary text-on-primary" : "text-fg hover:bg-surface",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 border-t border-default pt-8">
      <h2 id={id} className="text-h2 text-fg">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function TokenCheck() {
  const [theme, setTheme] = useState<ThemeChoice>("system");
  const snapshot = useSyncExternalStore(subscribeToTheme, readAllTokens, () => "");
  const values = useMemo(
    () => Object.fromEntries(snapshot.split(";").filter(Boolean).map((pair) => pair.split("="))),
    [snapshot],
  ) as Record<string, string>;
  const today = useSyncExternalStore(noSubscription, () => colourOfDay(new Date()).key, () => null);

  const chooseTheme = (next: ThemeChoice) => {
    setTheme(next);
    applyTheme(next);
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-gutter py-10">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex max-w-prose flex-col gap-2">
          <p className="text-small text-muted">AP TransitOS · Day 1</p>
          <h1 className="text-h1 text-fg">Design tokens</h1>
          <p className="text-body text-muted">
            Temporary check page for the tokens in docs/09. Every colour below comes from a CSS
            variable, so switching the theme updates the values live.
          </p>
        </div>
        <ThemeSwitch value={theme} onChange={chooseTheme} />
      </header>

      <Section id="colours" title="Colours">
        <div className="flex flex-col gap-8">
          {COLOUR_GROUPS.map((group) => (
            <div key={group.title} className="flex flex-col gap-3">
              <h3 className="text-h3 text-fg">{group.title}</h3>
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {group.tokens.map((token) => (
                  <li key={token.name} className="flex flex-col gap-2">
                    <div className={cn("h-16 rounded-md border border-default", token.className)} />
                    <div className="flex flex-col">
                      <code className="font-mono text-small text-fg">{token.name}</code>
                      <span className="font-mono text-caption text-subtle tabular-nums">
                        {values[token.name] ?? ""}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section id="status" title="Status tones">
        <p className="text-body text-muted">
          Colour is never the only signal. Real badges always add an icon and a label (docs/09).
        </p>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(TONES) as StatusTone[]).map((tone) => (
            <li
              key={tone}
              className="flex flex-col gap-3 rounded-lg border border-default bg-surface-raised p-4"
            >
              <code className="font-mono text-small text-fg">{tone}</code>
              <span className="flex flex-wrap gap-2">
                <span className={cn("rounded-sm px-2 py-1 text-small font-medium", TONES[tone].soft)}>
                  {TONES[tone].example}
                </span>
                <span className={cn("rounded-sm px-2 py-1 text-small font-medium", TONES[tone].solid)}>
                  {TONES[tone].example}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="day-colours" title="Colour of the day">
        <p className="text-body text-muted">
          Shown as a band on live tickets, always with its name in text.
          {today ? ` Today in India: ${DAYS.find((d) => d.key === today)?.colour ?? ""}.` : ""}
        </p>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {DAYS.map((entry) => (
            <li
              key={entry.day}
              className={cn(
                "flex h-14 items-center justify-between rounded-md px-4 text-small font-medium text-on-solid",
                entry.className,
              )}
            >
              <span>{entry.day}</span>
              <span>
                {entry.colour}
                {entry.key === today ? " · today" : ""}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="type" title="Type scale">
        <p className="text-body text-muted">
          Inter for English, Noto Sans Telugu for Telugu. Telugu lines are 15 percent taller.
        </p>
        <ul className="flex flex-col divide-y divide-default rounded-lg border border-default">
          {TYPE_SCALE.map((row) => (
            <li key={row.token} className="grid gap-3 p-4 md:grid-cols-3 md:items-baseline">
              <div className="flex flex-col">
                <code className="font-mono text-small text-fg">{row.token}</code>
                <span className="text-caption text-subtle tabular-nums">{row.spec}</span>
              </div>
              <p className={cn("min-w-0 text-fg", row.className)}>{EN_SAMPLE}</p>
              <p lang="te" className={cn("min-w-0 text-fg", row.className)}>
                {TE_SAMPLE}
              </p>
            </li>
          ))}
        </ul>
        <p className="text-h3 text-fg tabular-nums">06:30 AM · ₹541 · 12:10 PM · Seat 18</p>
      </Section>

      <Section id="spacing" title="Spacing (4 px grid)">
        <ul className="flex flex-col gap-2">
          {SPACING.map((step) => (
            <li key={step.px} className="flex items-center gap-4">
              <span className="w-12 text-right font-mono text-caption text-subtle tabular-nums">
                {step.px}
              </span>
              <span className={cn("h-3 rounded-sm bg-primary", step.className)} />
            </li>
          ))}
        </ul>
      </Section>

      <Section id="shape" title="Radius and elevation">
        <ul className="flex flex-wrap gap-4">
          {RADII.map((radius) => (
            <li key={radius.name} className="flex flex-col items-center gap-2">
              <div className={cn("size-16 border border-strong bg-surface", radius.className)} />
              <span className="font-mono text-caption text-subtle">{radius.name}</span>
            </li>
          ))}
        </ul>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {SHADOWS.map((shadow) => (
            <li key={shadow.name} className={cn("rounded-lg bg-surface-raised p-4", shadow.className)}>
              <code className="font-mono text-small text-fg">shadow-{shadow.name}</code>
              <p className="text-small text-muted">{shadow.use}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="focus" title="Focus ring">
        <p className="text-body text-muted">Press Tab to move through these. The ring is never removed.</p>
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            className="h-11 rounded-md bg-primary px-4 font-medium text-on-primary transition-colors duration-fast ease-out hover:bg-primary-hover"
          >
            Search buses
          </button>
          <button
            type="button"
            className="h-11 rounded-md border border-strong px-4 font-medium text-fg transition-colors duration-fast ease-out hover:bg-surface"
          >
            View route
          </button>
          <a href="#colours" className="font-medium text-primary underline-offset-4 hover:underline">
            Back to colours
          </a>
        </div>
      </Section>

      <Section id="primitives" title="Day 2 UI primitives">
        <PrimitivesShowcase />
      </Section>
    </main>
  );
}
