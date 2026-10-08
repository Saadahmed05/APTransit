# packages/ui (`@aptransit/ui`)

Design tokens and React components for AP TransitOS. Owner: Dev A. Rules: `docs/09-design-system.md`. Source only: Next.js compiles it (`transpilePackages` in `apps/web/next.config.ts`), so there is no build step.

## Exports

| Import | What |
| --- | --- |
| `@aptransit/ui/tokens.css` | every design token plus the Tailwind theme. Imported once in `apps/web/app/globals.css`, right after Tailwind |
| `@aptransit/ui` | `cn()` today, all components from Day 2 |

## The one rule

**Raw colour values live only in `src/tokens.css`.** Components and pages use the classes below. Tailwind's default palette, font sizes, radii, shadows and easings are removed on purpose, so `bg-white`, `text-gray-500`, `text-lg`, `rounded-2xl` and `shadow-xl` do not exist and silently do nothing.

## Classes you can use

### Colour

| Class | Token | Use |
| --- | --- | --- |
| `bg-bg` | `--bg` | page background |
| `bg-surface` | `--surface` | grey areas, table header, subtle fills |
| `bg-surface-raised` | `--surface-raised` | cards, sheets, popovers |
| `bg-surface-sunken` | `--surface-sunken` | wells, the segmented tab track, skeletons |
| `border-default` | `--border` | dividers, card borders (decorative) |
| `border-hairline` | `--border-subtle` | list dividers inside cards (not `border-subtle`: `subtle` is the text colour) |
| `border-strong` | `--border-strong` | input, checkbox and control borders (3:1 contrast) |
| `text-fg` | `--text` | main text |
| `text-muted` | `--text-muted` | secondary text, labels |
| `text-subtle` | `--text-subtle` | hints, timestamps (never key info) |
| `bg-primary`, `text-primary`, `hover:bg-primary-hover` | `--primary`, `--primary-hover` | primary buttons, links, current step |
| `bg-primary-soft` | `--primary-soft` | selected rows, chips |
| `text-on-primary` | `--on-primary` | text on primary |
| `text-status-<tone>` | tone text colour | status text and icons |
| `bg-status-<tone>-soft` | tone soft background | badges |
| `bg-status-<tone>-solid` + `text-on-solid` | solid tone + white | scanner result, map markers |
| `bg-day-mon` to `bg-day-sun` | colour of the day | ticket band only |
| `bg-scrim` | `--scrim` | dim layer behind Dialog and Sheet |
| `bg-transparent`, `bg-current`, `bg-inherit` | built in | still available |

Tones: `success`, `info`, `warning`, `danger`, `maintenance`, `neutral`. Map a status to a tone only through `STATUS_MAP` and `TICKET_STATUS_MAP` in `@aptransit/shared`, never by hand.

Every colour works in light and dark automatically (tokens switch on `data-theme` on `<html>` or the OS setting). Do not use `dark:` variants for colours.

### Type

| Class | Size / line height / weight | Use |
| --- | --- | --- |
| `text-display-lg` | 40 / 48 / 600 | KPI numbers, kiosk scan result |
| `text-display` | 32 / 40 / 600 | one per page: greeting, big ticket time |
| `text-h1` | 24 / 32 / 600 | page title, one per page |
| `text-h2` | 20 / 28 / 600 | section title |
| `text-h3` | 17 / 24 / 600 | card title |
| `text-body-lg` | 17 / 26 | driver and conductor body |
| `text-body` | 16 / 24 | default (inputs never smaller) |
| `text-small` | 14 / 20 | secondary info |
| `text-caption` | 12 / 16 / 500 | meta, timestamps |

Also: `font-sans` (Inter, then Noto Sans Telugu), `font-mono`, `tabular-nums` for times, money and counts. Elements with `lang="te"` get 15 percent taller line heights and no letter spacing automatically. Display and heading sizes carry their own tracking.

### Space, shape, depth, motion

| Class | Value |
| --- | --- |
| `p-*`, `gap-*`, `w-*` and friends | 4 px grid (`p-4` is 16 px). Stay on the docs/09 scale: 1, 2, 3, 4, 5, 6, 8, 10, 12, 16 |
| `px-gutter` | page gutter: 16 px mobile, 24 px tablet, 32 px desktop |
| `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-full` | 8, 12, 16, 24 px, pill |
| `shadow-sm`, `shadow-md`, `shadow-lg` | sticky bars, popovers and sheets, dialogs. Cards use a border, not a shadow |
| `z-sticky`, `z-header`, `z-overlay`, `z-sheet`, `z-dialog`, `z-toast` | 10, 20, 40, 50, 60, 70 |
| `duration-fast`, `duration-base`, `duration-slow`, `duration-hold` | 120, 200, 320 ms, 3 s |
| `animate-enter`, `press-scale`, `animate-drain` | fade plus 8 px rise, press to 0.98, 3 s draining bar (all transform and opacity, dropped by reduced motion) |
| `ease-out`, `ease-in` | docs/09 curves |

Breakpoints are Tailwind's defaults (`sm` 640, `md` 768, `lg` 1024, `xl` 1280), which match docs/09.

### Built into the base layer

- Visible focus ring on every focusable element (2 px primary, 2 px offset). Never remove it.
- `prefers-reduced-motion`: animations stop, transitions become opacity only.
- Long words wrap (`overflow-wrap: break-word` on body). In flex and grid rows, give text cells `min-w-0` too.

## `cn()`

```ts
import { cn } from "@aptransit/ui";

<button className={cn("h-11 rounded-md px-4 text-body", isPrimary && "bg-primary text-on-primary", className)} />
```

`cn` is `clsx` plus `tailwind-merge` taught our token names. If you add a new class family (a new text size, layer, duration or spacing name), register it in `src/cn.ts`, otherwise two unrelated classes can cancel each other.

## Adding a token

1. Add the raw value in `src/tokens.css` (in `:root`, and in **both** dark blocks if it changes by theme).
2. Map it: colours in `@theme inline` (`--color-<name>: var(--<token>)`), sizes in `@theme`, or add an `@utility`.
3. Register new class families in `src/cn.ts`.
4. Add it to the tables above and to the token check page (or `/design` from Day 3).
5. Colour changes must keep WCAG AA (4.5:1 text, 3:1 control borders) in both themes. Check before merging.

## Components (from Day 2)

Components with event handlers or Radix state start with `"use client"` so server pages can render them. EmptyState, Card, Field, Input, Textarea, Skeleton, Spinner and StatusBadge stay server safe (server pages pass them icon components). Border colours are `border-default` and `border-strong` (not `border-border-*`, which do not exist).

Put each component in `src/components/<name>.tsx`, export it from `src/index.ts`, and follow `docs/09` (variants, states, keyboard, dark mode). Text always comes in through props or `children`, never hardcoded. Tests live next to the component (test setup arrives with the first component, see `progress/handoff.md`, Day 2 notes).

Day 4 additions:

- `OtpInput`: one box per digit, paste and SMS autofill spread over the boxes, `autocomplete="one-time-code"` on the first box, `onComplete` for auto submit. Labels come in as `groupLabel` and `digitLabel(position, total)`.
- `DatePicker`: Today and Tomorrow chips plus a `Calendar` in a Dialog (ARIA grid keys: arrows, Home, End, Page Up, Page Down). Dates are `YYYY-MM-DD` strings; the caller passes `today` (IST) and `locale`, so the component never reads the device clock. `addDays` and `monthGrid` are exported.
- Dialog close button is now a 44 px target.

## Booking components (Day 6)

- `Stepper`: steps, current index, `announcement` ("Step 2 of 3: Details") read politely on change.
- `SeatMap`: renders a `SeatLayout` with seat states from `GET /trips/:id/seats`. Pass translated `labels` (including `seat(seatNo, state)`), `selected`, `onToggle`, `maxSelectable`. One tab stop, arrow keys move, Enter or Space toggles.

## Days 8 to 10

- `TicketCard`: full ticket with a perforation; QR area as children. `OfflineBanner`. `Countdown` (uses `countdownParts` from shared, one timer, paused while hidden, hidden summary once a minute).
- Tokens: `qr-ink` and `qr-paper` (the QR is black on white in both themes), `--dur-band`, utilities `animate-ticket-band` (stops under reduced motion) and `animate-fade-in`.

## Tracking components

RouteProgress is exported from the main entry and announces the current stop politely. MapView is exported only from @aptransit/ui/map-view, so consumers can dynamically import it without adding MapLibre to other routes. It reads map colours from theme variables, shows attribution and provides a separate recenter button. --spacing-tracking-map defines the mobile map height.

--map-line-width supplies pixel widths for the map renderer.

## Day 14

Day 14 adds typed DataTable (sorting, aria-sort, keyboard row actions, filter slot, skeleton/empty and cursor controls), KpiTile (delta icon/tone, optional link and skeleton), IncidentStatusBadge and the lazy OpsMap with multiple bus markers and detail popups. Component tests cover the new table and KPI behavior.

## v2 minimal system (D-033)

Values changed, names did not (a colour edit never renames a token). The spec is `docs/09-design-system.md`.

- `tokens.test.ts` reads `tokens.css` and fails when a text pair drops under 4.5:1 or a border under 3:1, in light and both dark blocks, and when the two dark blocks differ.
- `Button` has a `sm` size (36 px, desktop tables only). `Tabs` list has `variant="segmented"` (default) or `"underline"`.
- New components: `BottomNav` (field apps, 4 items, 56 px), `StatusChip` (soft chip for device state), `ResultSplash` (full screen scan result, drains 3 s then `onReset`), `HoldButton` (press and hold 3 s, Space or Enter on a keyboard). All four are on `/design` in light and dark.
- jsdom has no `PointerEvent`: in tests send a `MouseEvent` named `pointerdown` when you need a real `button` value.
