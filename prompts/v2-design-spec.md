# AP TransitOS v2 · Design spec (minimal)

Companion to `prompts/v2-journey-plan.md` (phases P1, P6, P9, P10). This file is the single reference for colour, type, spacing, components and UX behaviour. When P1 lands, its content replaces `docs/09-design-system.md` (decision D-033).

**Direction in one line:** a quiet canvas, confident type, one accent. The bus, the time and the ticket are the heroes; the interface steps back.

**Rules that never change:** tokens only (no raw hex outside `packages/ui/src/tokens.css`), status from `packages/shared/src/status.ts` (label + icon + colour, never colour alone), WCAG 2.2 AA, every string in en.json and te.json, no em or en dash.

---

## 1. Principles

1. **One job per screen.** Each screen answers one question ("Which bus?", "Is my ticket valid?"). One primary button.
2. **Content first, chrome last.** No decorative icons, illustrations, gradients, glass or patterns. Whitespace does the grouping, not boxes inside boxes.
3. **Hierarchy through type, not colour.** Size and weight carry importance. Colour is reserved for the accent (actions) and status.
4. **Defaults over decisions.** Today, Leave now, my location, the last used stops. The user only changes what is different.
5. **Show the next step.** Never a dead end: every empty or error state has one clear action.
6. **Numbers are UI.** Times, prices, seats and counts are large, tabular and aligned.
7. **Calm motion.** Motion explains a change (enter, exit, success). Never decoration, never loops (except the live ticket band).
8. **Same system, different jobs.** Citizen, driver, conductor, scanner, ops, gov and admin share tokens, components, status and wording. Only density and target size change.

---

## 2. Colour

All values below were checked for contrast (WCAG 2.2 AA: text at least 4.5:1, borders and icons at least 3:1). Ratios are against the named background.

### 2.1 Light

| Token | Value | Use | Contrast |
| --- | --- | --- | --- |
| `--bg` | `#f8f9fb` | Page canvas | |
| `--surface` | `#f1f3f6` | Sections, chips, table header | |
| `--surface-raised` | `#ffffff` | Cards, sheets, inputs | |
| `--surface-sunken` (new) | `#eceff3` | Wells, segmented control track, skeleton | |
| `--border` | `#e3e6eb` | Card and divider hairlines | decorative |
| `--border-subtle` (new) | `#eceef2` | List dividers inside cards | decorative |
| `--border-strong` | `#7a8495` | Input borders, focusable outlines | 3.78 on white, 3.40 on surface |
| `--text` | `#0f1729` | Primary text | 17.87 on white, 16.97 on bg |
| `--text-muted` | `#475265` | Secondary text | 7.89 on white, 7.09 on surface |
| `--text-subtle` | `#5d6778` | Captions, meta | 5.71 on white, 5.14 on surface |
| `--primary` | `#1d4ed8` | Accent: primary buttons, links, focus, active nav | 6.70 on white, white on it 6.70 |
| `--primary-hover` | `#1e40af` | Hover and pressed | |
| `--primary-soft` | `#edf2ff` | Selected row, active chip, info note | primary on it 5.98 |
| `--on-primary` | `#ffffff` | Text on primary | |

Status (text colour, soft background; solid = the text colour with white text):

| Tone | Text | Soft | Text on soft | White on solid |
| --- | --- | --- | --- | --- |
| success | `#157a3c` | `#ecf7f0` | 4.93 | 5.41 |
| info | `#1d4ed8` | `#edf2ff` | 5.98 | 6.70 |
| warning | `#a14a06` | `#fdf3e7` | 5.48 | 6.00 |
| danger | `#b42318` | `#fdeeec` | 5.83 | 6.57 |
| maintenance | `#6941c6` | `#f3effc` | 5.85 | 6.62 |
| neutral | `#475265` | `#eef0f4` | about 7 | 7.89 |

### 2.2 Dark

| Token | Value | Contrast |
| --- | --- | --- |
| `--bg` | `#0a0d12` | |
| `--surface` | `#10141b` | |
| `--surface-raised` | `#161b23` | |
| `--surface-sunken` | `#0d1117` | |
| `--border` | `#242c37` | decorative |
| `--border-subtle` | `#1b222b` | decorative |
| `--border-strong` | `#6b7685` | 3.75 on raised, 4.22 on bg |
| `--text` | `#e8ecf2` | 14.58 on raised |
| `--text-muted` | `#a7b0bd` | 7.89 on raised |
| `--text-subtle` | `#8c96a4` | 5.77 on raised |
| `--primary` | `#86a8ff` | 7.45 on raised; bg on it 8.39 |
| `--primary-hover` | `#a5bfff` | |
| `--primary-soft` | `#16224a` | primary on it 6.65 |
| `--on-primary` | `#0a0d12` | |

| Tone | Text | Soft | Text on soft |
| --- | --- | --- | --- |
| success | `#4fd18b` | `#10291b` | 7.99 |
| info | `#86a8ff` | `#16224a` | 6.65 |
| warning | `#f5b83d` | `#2e220b` | 8.75 |
| danger | `#ff8f87` | `#3a1714` | 7.26 |
| maintenance | `#b9a5fb` | `#231b40` | 7.55 |
| neutral | `#a7b0bd` | `#1c222c` | about 7 |

Solid status backgrounds stay the light text colours in both themes (white text on top), as today.

### 2.3 Colour rules

- **Accent budget:** at most one filled primary element per viewport (the main button). Links and the active nav item may also use primary text.
- **Status uses soft tone by default** (chip on soft background). Solid only for: scan result splash, SOS, a cancelled trip banner, destructive confirm.
- **Never colour alone:** every status shows icon + label.
- **QR stays black on white** in both themes (`--qr-ink`, `--qr-paper`), with a 16 px white quiet zone.
- **Colour of the day** band on tickets stays (anti fraud), always with the day name in text.
- **Maps:** route line `--primary`, stops neutral, live bus primary with a white ring, incidents danger. No other map colours.
- **Charts:** one series = primary; comparison = primary + neutral (`--text-subtle`); status series use status tones. Gridlines `--border-subtle`. No rainbow palettes.

---

## 3. Typography

**Families:** Inter (Latin) and Noto Sans Telugu (Telugu), already self hosted through `next/font` in `apps/web/app/layout.tsx`. No third font.

**Weights:** 400 (body), 500 (labels, buttons, caption), 600 (headings, key numbers). Never 700 or above, never italic for emphasis.

### 3.1 Scale (token name, size / line height / weight / tracking)

| Token | Size / line | Weight | Tracking | Use |
| --- | --- | --- | --- | --- |
| `display` | 32 / 40 | 600 | -0.02em | One per page max: home greeting, scan result, big ticket time |
| `display-lg` (new) | 40 / 48 | 600 | -0.02em | Desktop hero, gov KPI numbers, kiosk result |
| `h1` | 24 / 32 | 600 | -0.015em | Page title |
| `h2` | 20 / 28 | 600 | -0.01em | Section title |
| `h3` | 17 / 24 | 600 | 0 | Card title |
| `body-lg` | 17 / 26 | 400 | 0 | Field apps body, important sentences |
| `body` | 16 / 24 | 400 | 0 | Default |
| `small` | 14 / 20 | 400 | 0 | Secondary info, table cells |
| `caption` | 12 / 16 | 500 | 0.01em | Labels above values, chip text, meta |

- Telugu: line heights x1.15 (already in tokens.css), tracking always 0 (add `letter-spacing: 0` under `:lang(te)`).
- Minimum body size 16 px on inputs (prevents iOS zoom).
- Field apps (driver, conductor, scanner): body is `body-lg`, titles `h1`, results `display` or `display-lg`.

### 3.2 Numbers and formats

- Every time, price, seat, count and code uses `tabular-nums` (Tailwind built in). Times and prices are `font-semibold`.
- Format rules come from `docs/10-ux-writing.md` (do not invent). Use the existing helpers in `packages/shared` for money (paise to rupees) and IST time.
- Time ranges use "to": "06:30 to 12:10". Never a dash.
- Ticket and booking codes: monospace token `font-mono`, grouped in 4s for reading aloud.

### 3.3 Writing (from docs/10, kept short)

- Buttons are verbs: "Search buses", "Book seat", "Activate ticket", "Show QR", "Start trip". Never "Submit", "OK", "Click here".
- Errors say what happened and what to do: "This ticket ends at Nandyal. Ask the passenger to buy a new ticket."
- Sentence case everywhere. No exclamation marks except the success splash.

---

## 4. Space and layout

**Base unit 4 px.** Allowed steps: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 (Tailwind 1, 2, 3, 4, 5, 6, 8, 10, 12, 16). No other values.

| Where | Value |
| --- | --- |
| Page gutter | 16 mobile, 24 tablet, 32 desktop (`--gutter`, existing) |
| Card padding | 16 mobile, 20 tablet and up |
| Gap inside a card | 12 |
| Gap between cards in a list | 12 |
| Gap between sections | 32 mobile, 48 desktop |
| Label to input | 6 (use 8 if the grid is strict) |
| Input to helper or error | 6 |

**Content width**

| App | Max width | Layout |
| --- | --- | --- |
| Citizen | 640 px centred (app feel on desktop too) | Single column; sticky bottom action bar on mobile for the main button |
| Driver, conductor | full width, max 560 | Single column, bottom nav |
| Scanner kiosk | full screen | No chrome |
| Ops, admin | 1280 | Sidebar 240 + content; tables full width |
| Gov | 1440 | KPI row, then 12 column grid |

**Breakpoints:** 360 (design floor), 768, 1024, 1280. Test at 360, 390, 768, 1280.

---

## 5. Shape, border, elevation, focus

| Token | Value | Use |
| --- | --- | --- |
| `radius-sm` | 8 | Chips, small buttons, inputs inside tables |
| `radius-md` | 12 | Buttons, inputs, list rows, toasts |
| `radius-lg` | 16 | Cards, dialogs |
| `radius-xl` | 24 | Bottom sheet top corners, ticket card, kiosk result |
| `radius-full` | pill | Status chips, avatars, nav indicator |

- **Borders:** cards use 1 px `--border` on `--surface-raised`. Rows inside cards are separated by `--border-subtle`, inset 16 px from the left. Never double borders.
- **Elevation only for things that float:** `shadow-sm` sticky header after scroll, `shadow-md` dropdowns and popovers, `shadow-lg` dialogs and sheets. Cards never have shadows.
- **Focus:** 2 px `--primary` outline, 2 px offset, on every focusable element (existing base layer). Never removed. In the kiosk, focus ring 3 px.
- **Touch targets:** 44 px minimum (citizen, ops, gov, admin), 56 px (driver, conductor, scanner, bottom nav).

---

## 6. Motion

Only `transform` and `opacity`. CSS only (no animation library).

| Token | Value | Use |
| --- | --- | --- |
| `--dur-fast` | 120 ms | Hover, press, toggle, chip select |
| `--dur-base` | 200 ms | Expand, tab change, toast in, inline validation |
| `--dur-slow` | 320 ms | Sheet and dialog in, page section enter, scan result |
| `--ease-out` | `cubic-bezier(0.2, 0, 0, 1)` | Everything that enters |
| `--ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | Everything that leaves (use 80 percent of the enter duration) |

Patterns:

- **Press:** buttons and tappable cards scale to 0.98 for `--dur-fast`.
- **Enter:** fade + 8 px rise. Lists stagger 30 ms per item, max 6 items, then the rest appear together.
- **Sheet:** slide up from bottom (mobile), fade + scale 0.98 to 1 (desktop dialog).
- **Skeleton:** shimmer allowed; show only after 300 ms of loading to avoid flicker; minimum 400 ms once shown.
- **Success:** check icon draws in once (scan VALID, payment done). No confetti.
- **Reduced motion:** existing block keeps fades and drops movement. Test it.

---

## 7. Icons

- lucide-react only (docs/04). Size 20 in UI, 16 inside chips and small buttons, 24 in field apps, 64 to 96 in the scan result splash.
- Stroke 1.75 (set once via a wrapper or `strokeWidth`), colour inherits text.
- Icons appear next to a label or as a status icon. Icon only buttons need an `aria-label` and a tooltip on desktop.

---

## 8. Components

Keep every existing prop, accessible name and test id (E2E depends on them).

| Component | Spec |
| --- | --- |
| **Button** | Heights: sm 36 (desktop tables only), md 44, lg 52, xl 56 (field apps and main actions). Radius md. Variants: `primary` (filled), `secondary` (raised surface + 1 px border-strong), `ghost` (no border, surface on hover), `danger` (filled danger solid), `link`. Icon 20 left of label, gap 8. Loading: spinner replaces the icon, label stays, `aria-busy`. Disabled: 40 percent opacity, no pointer. Full width on mobile for the main action |
| **Input, Select, Textarea** | Height 48, radius md, 1 px border-strong, raised surface, 16 px text. Label above (`small`, 500, text colour). Helper below (`small`, muted). Error: danger border + icon + message below, `aria-invalid`, `aria-describedby`. Validate on blur, re-validate on change after the first error |
| **Segmented control** (Leave at / Arrive by, tabs on mobile) | Sunken track, raised selected pill, radius md, height 44 |
| **Card** | Raised surface, 1 px border, radius lg, padding 16/20, no shadow. Interactive card: whole card is one link, hover border-strong, press scale 0.98, chevron at the end |
| **List row** | Min height 56, padding 16, leading icon optional, title + meta, trailing value or chevron, divider border-subtle inset |
| **Status chip** | Height 24, pill, soft background, tone text, 14 px icon + caption label. From `STATUS_MAP` only |
| **Info note** | Primary soft (or status soft) background, radius md, padding 12, icon 16 + small text. Used for hints like the test login code |
| **Tabs** | Underline style on desktop (2 px primary indicator), segmented on mobile. Tab state in the URL where the page already does it |
| **Sheet / Dialog** | Sheet on mobile (radius xl top, 36 x 4 handle, max 90 svh), dialog on desktop (radius lg, max 480). Scrim token. Title h2, one primary action at the bottom right (desktop) or full width (mobile). Esc and scrim close unless destructive |
| **Toast** | One at a time, 4 s, bottom centre above the bottom nav on mobile, top right on desktop. Success and info only; errors stay inline |
| **Empty state** | 40 px icon in a 64 px surface circle, h3 title, one sentence, one action. Centred, max 320 wide |
| **Error state** | Same layout as empty, danger icon, "Try again" button that retries the query |
| **Skeleton** | Same shape as the final content (not grey bars of random width). Sunken colour |
| **Top bar** | 56 high, bg canvas, title left, actions right (bell, account). Hairline appears after scroll |
| **Bottom nav** (new) | 64 + safe area, 4 items max, icon 24 + caption label, active = primary text + 3 px pill above the icon, `aria-current="page"` |
| **Trip card** | Row 1: departure time (h2, tabular) and arrival time (small, muted) with duration between; fare right aligned (h3). Row 2: service type, seats left, live chip. If live time differs: "Expected 08:42" in warning tone under the scheduled time, scheduled time struck through only when delay is at least 5 min |
| **Ticket card** | Radius xl. Colour of the day band 8 px top with day name. Route "Kurnool to Vijayawada" (h2). Date and time large (display, tabular). Seat, passenger, code (mono). Status chip. QR 240 px on white with quiet zone. Caption "Show this to the conductor or the door scanner". Brightness hint once |
| **Result splash** (new) | Full screen solid tone (success or danger), icon 96, label display-lg, one line reason (body-lg), passenger and seat. Auto reset ring for 3 s. `role="status"` (VALID) or `role="alert"` (rejected). Sound + vibration as today |
| **Hold button** (new, SOS) | 64 high, danger solid, label "Hold for SOS". Progress ring fills over 3 s; release cancels; completion opens a confirm sheet with "Sent to depot" status. Keyboard: hold Space or Enter. Screen reader: "Press and hold for 3 seconds to send an emergency alert" |
| **KPI tile** | Caption label, value display-lg tabular, delta chip (success or danger soft with arrow icon and text "up 12 percent"), optional sparkline in primary. No border shadow, card style |
| **Data table** | Header surface, small 500 caption style, sticky. Rows 48, small text, numbers right aligned tabular. Zebra off. Row hover surface. Sort indicator icon + `aria-sort` |
| **Charts** (recharts) | No chart junk: no 3D, no legend for one series, direct labels, gridlines subtle, axis text caption subtle. Every chart has a table alternative or `sr-only` summary |
| **Heatmap** (stop demand) | Cells 32 x 32, five steps from `--surface` to `--primary` (use opacity steps of primary on surface), value on hover and in the table alternative |

---

## 9. UX behaviour (global)

- **Loading:** skeleton for content, spinner only inside buttons. Never block the whole page for a partial update.
- **Optimistic UI:** allowed for read state, mark as read, filter changes. Never for payment, activation, scan, booking (server is the source of truth).
- **Errors:** inline next to the cause. Network errors: keep the user's input, show "No connection. We will retry." and retry with backoff. Never clear a form on error.
- **Confirmation:** destructive actions (cancel ticket, end trip, revoke scanner) use a dialog that states the consequence and the refund or effect in numbers. Non destructive actions use undo in a toast instead of a dialog.
- **Forms:** one column, labels above, autofocus the first field only on dedicated form pages, Enter submits, the main button stays enabled and shows errors on press (do not disable it for invalid input).
- **Navigation:** back always returns to the previous scroll position; filters, tabs and dates live in the URL.
- **Keyboard:** everything reachable; Esc closes overlays; focus moves to the new step's heading or first field after a step change (pattern already in `login-form.tsx`).
- **Language switch:** keeps the page and its state.
- **Offline (field apps):** status chip "Offline, n pings saved" and calm behaviour; never a blocking error.

---

## 10. App patterns

**Citizen (mobile first):**

- Home: greeting (h1), one search card (From, To with swap, Leave at / Arrive by, date chips Today / Tomorrow / Pick), "Use my location" as a ghost button inside the From field, recent searches as chips below. Nothing else above the fold.
- Results: sticky summary bar (From to To, date, Edit), time band chips, trip cards. Live chips update without layout shift.
- Booking: stepper (Seat, Details, Ticket type, Pay). Sticky bottom bar with total and the main button.
- Ticket: ticket card first, then a 3 step strip (Activate, Show QR, Boarded), then details in a disclosure.

**Driver (glanceable, gloves on, sun):**

- Today: duty card (bus number display, route h2, departure time display) and one button "Start trip".
- Trip: next stop (h1) and ETA (display), GPS chip, Break toggle, Report (secondary), SOS hold button separated at the bottom, End trip in a menu with confirm.
- Body-lg everywhere, 56 px targets, high contrast, dark theme looks right.

**Conductor (speed):**

- Scan screen is the home of the trip: camera full width, last result strip, counts in the top bar. Result appears in under 300 ms after the response, auto clears.
- Manifest: list rows by seat with status chip, search by seat or name.

**Door scanner kiosk:** full screen camera, idle message "Show your ticket QR here" (display), result splash, auto reset. No touch needed in normal use.

**Ops (dense, calm):** sidebar, table first pages, filters as chips above the table, detail in a side drawer, SOS banner sticky at the top in danger solid until acknowledged.

**Gov (overview to detail):** KPI row (4 tiles), map + incident feed, then sections. Breadcrumb State > District > Depot > Route. Insight sentences in plain words above charts.

**Admin (forms):** list + editor pattern, Save in a sticky footer, audit note "Changes apply to new sales only" where relevant, "Demo price" chip on demo values.

---

## 11. Key screens (wireframes)

```text
Citizen home (360 px)                 Trip results
+--------------------------------+   +--------------------------------+
| AP TransitOS          [bell][A]|   | Kurnool to Vijayawada  [Edit]  |
|                                |   | Today · Leave now              |
| Good morning                   |   | [Morning][Afternoon][Evening]  |
| Where are you going?           |   |                                |
| +----------------------------+ |   | +----------------------------+ |
| | From  Kurnool RTC  [locate]| |   | | 08:30 ---- 3h 40m ---- 12:10| |
| | To    Vijayawada      [swap]| |   | |                     Rs 412 | |
| | [Leave at | Arrive by] 08:00| |   | | Express · 12 seats  [On time]| |
| | [Today][Tomorrow][Pick]    | |   | +----------------------------+ |
| | [     Search buses       ] | |   | +----------------------------+ |
| +----------------------------+ |   | | 09:15 ---- 3h 50m ---- 13:05| |
| Recent: (Nandyal) (Kurnool)    |   | | Expected 09:27  [Delayed]  | |
+--------------------------------+   +--------------------------------+

Ticket                                Driver trip
+--------------------------------+   +--------------------------------+
| ===== THURSDAY (band) ======== |   | Trip KNL-VJA-01   [GPS ok]     |
| Kurnool to Vijayawada          |   | Next stop                      |
| Thu 8 Oct · 08:30              |   | Nandyal                        |
| Seat 18 · Ravi K               |   | 12 min                         |
|        +-----------+           |   | [ Break ]   [ Report issue ]   |
|        |    QR     |           |   |                                |
|        +-----------+           |   | [ Hold for SOS (3 s) ]         |
|  Show this to the conductor    |   | [Today][Trip][Report][Alerts]  |
|  [Active]  APT-4K2M-9QXD       |   +--------------------------------+
+--------------------------------+
```

---

## 12. Implementation notes (P1)

1. Replace values in `packages/ui/src/tokens.css` for the three theme blocks (light, dark by system, dark by choice) using section 2. Keep every existing token name. Add `--surface-sunken` and `--border-subtle` to all three blocks and map them in `@theme inline` (`--color-surface-sunken`, `--color-subtle-border` or similar), then register the new class names in `packages/ui/src/cn.ts`.
2. Update the type scale in `@theme` (section 3.1) including `--text-*--letter-spacing`, add `display-lg`, and set `letter-spacing: 0` for type tokens under `:lang(te)`.
3. Update radius tokens (section 5): sm 8, md 12, lg 16, xl 24.
4. Keep motion tokens; add press and enter utilities (`animate-enter`) with reduced motion fallbacks.
5. Add a contrast unit test in `packages/ui` that parses tokens.css and asserts the ratios in section 2 (text 4.5, border-strong 3) for light and dark.
6. Refresh components in the order listed in the plan (P1), then the new ones.
7. Run `pnpm check:classes` after every component: Tailwind silently drops unknown classes (handoff gotcha).

---

## 13. Senior QA checklist (every screen, before the PR)

- [ ] 360, 390, 768, 1280 px: no horizontal scroll, nothing clipped, tap targets meet the minimum.
- [ ] Light, dark by system, dark by choice.
- [ ] English and Telugu (long words wrap, line heights correct, no untranslated keys).
- [ ] Keyboard only: order logical, focus visible, Esc closes, focus returns after overlays.
- [ ] Screen reader (NVDA or TalkBack): headings, labels, live regions for results and toasts.
- [ ] Zoom 200 percent: still usable.
- [ ] Reduced motion on.
- [ ] Slow 3G: skeletons appear, no layout shift when data lands.
- [ ] Four states: loading, empty, error with retry, success.
- [ ] Edge data: zero items, one item, 500 items, long names, Rs 0 and Rs 15,000, delay 0 and 90 min.
- [ ] Only one filled primary button in the viewport.
- [ ] No raw hex, no arbitrary values, no inline styles (`pnpm lint`, `pnpm check:classes`).
- [ ] axe: no serious or critical violations (route sweep).
