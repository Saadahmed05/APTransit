# 09 · Design system

**Status: LOCKED.** Source: plan sec 2, 24, 29, 47, 95 and the v2 design spec (`prompts/v2-design-spec.md`, decision D-033). Owner: Dev A. Rewritten in v2 phase P1: minimal visual system, no new dependency.

## Direction: quiet canvas, one accent

A public service used by millions, many on low end Android phones in bright sunlight. It must feel trustworthy, quiet and fast. The bus, the time and the ticket are the heroes; the interface steps back.

The 9 minimal principles (every screen follows them):

1. **One accent colour** (transit blue, `--primary`). Everything else is neutral greys and white.
2. **Flat surfaces.** Cards use a hairline border or a sunken background, never a shadow. Shadow only for things that float: the sticky header, dropdowns, sheets, dialogs, toasts.
3. **Generous whitespace.** A 4 px grid, bigger section gaps, fewer dividers. Whitespace groups content, not boxes inside boxes.
4. **Clear type hierarchy.** One display or h1 per screen, body 16, muted secondary text. Weights 400, 500 and 600 only.
5. **One primary action per screen.** Secondary actions are ghost or text buttons. At most one filled primary element in view.
6. **Fewer elements.** Rarely used details sit behind a "More details" disclosure. No decorative icons, illustrations, gradients or glass. Icons appear next to a label or as a status.
7. **Status chips stay** (label plus icon plus colour) but use the soft tone, not solid. Solid is only for errors, SOS, a cancelled trip banner, the scan result and a destructive confirm.
8. **Calm motion.** CSS only, existing tokens. Motion explains a change (enter, exit, success), never decorates. Reduced motion is respected.
9. **Big targets in field apps.** 56 px in driver, conductor and scanner, and large text for scan results.

Also: defaults over decisions (Today, Leave now, the last used stops), never a dead end (every empty or error state has one clear action), numbers are UI (times, prices and counts are large, tabular and aligned), and the same system serves citizen, driver, conductor, scanner, ops, gov and admin. Only density and target size change.

The only animated gradient is the live ticket band (anti screenshot).

## Tokens

Source of truth: `packages/ui/src/tokens.css`. Tailwind 4 reads them through `@theme inline`. Components use token classes only (`bg-surface`, `text-muted`, `border-default`), never raw hex. Every text pair below is checked by `packages/ui/src/tokens.test.ts` (WCAG 2.2 AA: 4.5:1 text, 3:1 UI boundaries). Token names never change, only values.

### Colour: light

| Token | Hex | Use | Contrast |
| --- | --- | --- | --- |
| `--bg` | #F8F9FB | Page canvas | |
| `--surface` | #F1F3F6 | Sections, chips, table header | |
| `--surface-raised` | #FFFFFF | Cards, sheets, inputs | |
| `--surface-sunken` | #ECEFF3 | Wells, segmented control track, skeleton | |
| `--border` | #E3E6EB | Card and divider hairlines (decorative) | |
| `--border-subtle` | #ECEEF2 | List dividers inside cards (class `border-hairline`) | decorative |
| `--border-strong` | #7A8495 | Input borders (must be seen) | 3.78 on white |
| `--text` | #0F1729 | Primary text | 17.87 on white |
| `--text-muted` | #475265 | Secondary text, labels | 7.89 on white |
| `--text-subtle` | #5D6778 | Captions, meta (never for key info) | 5.71 on white |
| `--primary` | #1D4ED8 | Primary buttons, links, focus ring, active nav | 6.70 on white, white on it 6.70 |
| `--primary-hover` | #1E40AF | Hover and pressed | |
| `--primary-soft` | #EDF2FF | Selected row, active chip, info note | 5.98 |
| `--on-primary` | #FFFFFF | Text on primary | |

### Colour: dark

Applied with `[data-theme="dark"]` and `prefers-color-scheme: dark` unless the user picked light. The two dark blocks in `tokens.css` always hold the same values (a test checks it).

| Token | Hex | Contrast |
| --- | --- | --- |
| `--bg` | #0A0D12 | |
| `--surface` | #10141B | |
| `--surface-raised` | #161B23 | |
| `--surface-sunken` | #0D1117 | |
| `--border` | #242C37 | decorative |
| `--border-subtle` | #1B222B | decorative |
| `--border-strong` | #6B7685 | 3.75 on raised |
| `--text` | #E8ECF2 | 14.58 on raised |
| `--text-muted` | #A7B0BD | 7.89 on raised |
| `--text-subtle` | #8C96A4 | 5.77 on raised |
| `--primary` | #86A8FF | 7.45 on raised |
| `--primary-hover` | #A5BFFF | |
| `--primary-soft` | #16224A | |
| `--on-primary` | #0A0D12 | 8.39 on primary |

### Status tones (one map for the whole product)

One resolved map. Colour is never the only signal: every status shows its label and icon. Status uses the soft tone by default.

| Tone | Light text / soft bg | Dark text / soft bg | Used for |
| --- | --- | --- | --- |
| `success` | #157A3C / #ECF7F0 (4.93) | #4FD18B / #10291B (7.99) | Completed, Checked, Valid, Resolved |
| `info` | #1D4ED8 / #EDF2FF (5.98) | #86A8FF / #16224A (6.65) | Running, Current, Active |
| `warning` | #A14A06 / #FDF3E7 (5.48) | #F5B83D / #2E220B (8.75) | Delayed, Expiring soon |
| `danger` | #B42318 / #FDEEEC (5.83) | #FF8F87 / #3A1714 (7.26) | Incident, Breakdown, Cancelled, Invalid |
| `maintenance` | #6941C6 / #F3EFFC (5.85) | #B9A5FB / #231B40 (7.55) | Maintenance |
| `neutral` | #475265 / #EEF0F4 (7) | #A7B0BD / #1C222C (7) | Upcoming, Not assigned, Not active, Used, Expired |

Solid variants (scan result splash, SOS, cancelled banner, destructive confirm): white text on the light text colour of the tone, in both themes (all at least 5.0:1).

### Colour rules

- **Accent budget:** at most one filled primary element per viewport (the main button). Links and the active nav item may also use primary text.
- **QR stays black on white** in both themes (`--qr-ink`, `--qr-paper`), with a 16 px white quiet zone.
- **Maps:** route line `--primary`, stops neutral, live bus primary with a white ring, incidents danger. No other map colours.
- **Charts:** one series is primary; a comparison is primary plus neutral (`--text-subtle`); status series use status tones. Gridlines `--border-subtle`. No rainbow palettes.

### Status labels (plan sec 95, same words everywhere)

Defined in `packages/shared/src/status.ts` as `{ key, tone, icon, i18nKey }`.

| Key | English | Tone | lucide icon |
| --- | --- | --- | --- |
| UPCOMING | Upcoming | neutral | `clock` |
| RUNNING | Running | info | `bus` |
| DELAYED | Delayed | warning | `timer` |
| COMPLETED | Completed | success | `circle-check` |
| CANCELLED | Cancelled | danger | `circle-x` |
| INCIDENT | Incident | danger | `triangle-alert` |
| BREAKDOWN | Breakdown | danger | `wrench` |
| MAINTENANCE | Maintenance | maintenance | `settings` |
| NOT_ASSIGNED | Not assigned | neutral | `circle-dashed` |

Trip display status is derived in one function `deriveTripDisplayStatus(trip)`: CANCELLED wins, then INCIDENT when `hasOpenIncident`, then COMPLETED, then DELAYED when `delayMinutes >= 5`, then RUNNING, else UPCOMING.

### Route progress colours (plan sec 23, 24)

| Segment state | Visual |
| --- | --- |
| Done | success line, filled dot, stop name in muted text |
| Current | info line, pulsing bus marker (static when reduced motion), bold stop name |
| Upcoming | neutral dashed line, hollow dot |
| Delayed | warning chip next to ETA: "Delayed 12 min" |
| Incident | danger chip with the incident type |

### Colour of the day (ticket anti fraud)

| Day | Name | Hex |
| --- | --- | --- |
| Monday | Blue | #1D4ED8 |
| Tuesday | Green | #15803D |
| Wednesday | Violet | #6D28D9 |
| Thursday | Amber | #B45309 |
| Friday | Teal | #0E7490 |
| Saturday | Pink | #BE185D |
| Sunday | Red | #B91C1C |

The ticket shows the colour as a band **and** its name in text ("Colour of the day: Teal"), so it works for colour blind conductors.

## Typography

- Fonts: **Inter** for Latin, **Noto Sans Telugu** for Telugu, loaded with `next/font`. No third font.
- Weights: 400 body, 500 labels and buttons and caption, 600 headings and key numbers. Never 700 or above, never italic for emphasis.
- Numbers use tabular figures (`tabular-nums`) in times, fares, counts, tables and KPIs. Times and prices are `font-semibold`.
- Telugu glyphs are taller: when `lang="te"`, line heights go up by `--leading-te` (1.15) and tracking is 0 on every type token.

| Token | Size / line | Weight | Tracking | Use |
| --- | --- | --- | --- | --- |
| `display-lg` | 40 / 48 | 600 | -0.02em | Desktop hero, gov KPI numbers, kiosk scan result |
| `display` | 32 / 40 | 600 | -0.02em | One per page at most: greeting, scan result, big ticket time |
| `h1` | 24 / 32 | 600 | -0.015em | Page title (one per page) |
| `h2` | 20 / 28 | 600 | -0.01em | Section title |
| `h3` | 17 / 24 | 600 | 0 | Card title |
| `body-lg` | 17 / 26 | 400 | 0 | Driver, conductor and scanner body, important sentences |
| `body` | 16 / 24 | 400 | 0 | Default body (never smaller on inputs, stops iOS zoom) |
| `small` | 14 / 20 | 400 | 0 | Secondary info, table cells |
| `caption` | 12 / 16 | 500 | 0.01em | Labels above values, chip text, meta (never for key info) |

Writing (docs/10): buttons are verbs ("Search buses", "Activate ticket"), never "Submit" or "OK". Errors say what happened and what to do. Sentence case everywhere. Ticket and booking codes use `font-mono`, grouped in 4s. Time ranges use "to".

## Space, radius, elevation, focus

| Scale | Values |
| --- | --- |
| Space (4 px grid) | 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 only |
| Page gutter | 16 mobile, 24 tablet, 32 desktop |
| Card padding | 16 mobile, 20 from 768 px |
| Gaps | 12 inside a card and between cards in a list, 32 mobile and 48 desktop between sections, 6 label to input |
| Radius | `sm` 8 (chips, small buttons), `md` 12 (buttons, inputs, rows, toasts), `lg` 16 (cards, dialogs), `xl` 24 (sheet top, ticket, kiosk result), `full` (status chips, avatars) |
| Shadow | `sm` sticky header after scroll, `md` dropdowns, popovers and toasts, `lg` dialogs and sheets. Cards never have a shadow |
| Z index | base 0, sticky 10, header 20, overlay 40, sheet 50, dialog 60, toast 70 |
| Focus | 2 px `--primary` outline, 2 px offset, on every focusable element, never removed (3 px in the kiosk) |
| Touch targets | 44 px minimum (citizen, ops, gov, admin), 56 px (driver, conductor, scanner, bottom nav) |

Borders: cards use 1 px `--border` on `--surface-raised`. Rows inside cards are separated by `--border-subtle` (class `border-hairline`), inset 16 px. Never double borders.

## Breakpoints and layout

| Name | Min width | Layout |
| --- | --- | --- |
| base | 0 (design at 360) | Single column, bottom nav (citizen, driver, conductor) |
| `sm` | 640 | Single column, wider cards |
| `md` | 768 | Citizen: two columns where useful. Ops and gov: collapsible sidebar |
| `lg` | 1024 | Ops and gov: fixed sidebar, content max 1280 |
| `xl` | 1280 | Gov: map plus side panel |

Test at 360, 390, 768 and 1280.

| Surface | Max width and shell |
| --- | --- |
| Citizen | 640 centred (app feel on desktop too). Single column, sticky bottom action bar for the main button on mobile. Top bar (logo, language, bell, account) |
| Driver, conductor | Full width, max 560. Single column, bottom nav (Driver: Today, Trip, Report, Alerts. Conductor: Today, Scan, Manifest, Alerts) |
| Scanner kiosk | Full screen, no chrome: camera, idle message, result splash |
| Ops, admin | 1280. Sidebar 240 plus content, tables full width, detail in a side drawer |
| Gov | 1440. KPI row, then a 12 column grid. Breadcrumb State, District, Depot, Route |

## Components (`packages/ui`)

Each component: all variants, states (default, hover, focus visible, active, disabled, loading), keyboard support, dark mode, and a story on the `/design` page. Props, accessible names and test ids never change when restyling (about 131 E2E selectors use them).

| Component | Spec |
| --- | --- |
| Button | primary (filled), secondary (raised surface, 1 px strong border), ghost, danger (solid), link. Sizes sm 36 (desktop tables only), md 44, lg 52, xl 56 (field apps and main actions). Radius md. Loading keeps the label and shows a spinner with `aria-busy`. Disabled is 40 percent opacity. Press scales to 0.98 |
| IconButton | Needs `aria-label`. 44 px hit area even if the icon is 20 |
| Input, Textarea, Select, Combobox | Height 48, radius md, 1 px strong border, 16 px text. Label always visible above, hint and error below with `aria-describedby`. Validate on blur, then on change after the first error |
| PlaceCombobox | From and To search with Telugu and English matching, recent places, swap |
| DatePicker | Today, Tomorrow chips plus calendar. Min today, max today + 30 |
| OtpInput | 6 boxes, paste support, auto submit, `autocomplete="one-time-code"` |
| Tabs | `segmented` (default): sunken track, raised selected pill, radius md, height 44. `underline` (desktop): 2 px primary indicator. Tab state in the URL where the page already does it |
| Card | Raised surface, 1 px border, radius lg, no shadow. Interactive: whole card is one link, hover strong border, press scale 0.98 |
| StatusBadge | Reads `status.ts`. Height 24 (sm) or 28 (md), pill, soft background, icon plus caption label |
| StatusChip | Small soft chip for device and trip state in field apps (online, GPS, trip, scanner). Tone, icon and label come from `status.ts`. `live` makes it a status region |
| TripCard | Departure time (h2, tabular), arrival and duration, fare (h3) right. Service type, seats left, live chip. Whole card is one link |
| SeatMap | Grid from `seatLayout`. States free, selected, taken, held, blocked. Each seat is a button with `aria-label="Seat 18, available"`. Legend with shapes, not only colour |
| Stepper | Booking steps: Seat, Details, Ticket type, Pay. Current step announced to screen readers |
| RouteProgress | Vertical stop list with done, current, upcoming, delay chips |
| TicketCard | Radius xl. Colour of the day band, route (h2), date and time (display, tabular), seat, passenger, code (mono), status, QR on white with a quiet zone |
| ResultSplash | Full screen solid tone (success or danger), 96 px icon, label (display-lg), one line reason, passenger and seat. A bar drains over 3 s, then the scanner resets. `role="status"` for VALID, `role="alert"` for a rejection |
| HoldButton | SOS: 64 px, danger solid, "Hold for SOS". A fill grows over 3 s, release cancels. Keyboard: hold Space or Enter. A hint is read by screen readers |
| BottomNav | Field apps: 64 px plus safe area, at most 4 items, icon 24 plus label, active is primary text with a 3 px pill above the icon, `aria-current="page"` |
| Countdown | Days, hours, minutes (seconds under 24 h). `aria-live="off"`, with a visually hidden summary that updates each minute |
| KpiTile | Caption label, value (display-lg, tabular), soft delta chip with icon and text, card style |
| DataTable | Sticky header, sortable columns with `aria-sort`, 48 px rows, numbers right aligned and tabular, pagination |
| MapView | MapLibre wrapper, bus markers by status tone with icon, clustering in gov view |
| Sheet (vaul) | Bottom sheet on mobile: radius xl top, 36 by 4 handle, max 90 svh, title h2, one primary action |
| Dialog | Confirmations. Radius lg. Title, one sentence, one primary action that names the action ("Cancel ticket", not "OK"). Never a modal on a modal |
| Toast (sonner) | Success and info only, 4 s, one at a time. Errors that need action stay inline |
| Skeleton | Same shape as the final content, sunken colour. Shown only after 300 ms, at least 400 ms once shown |
| EmptyState | 40 px icon in a 64 px circle, h3 title, one sentence, one action. Centred, narrow |
| ErrorState | Same layout as empty, danger icon, plain message from the error code, "Try again" retries the query, request id in small text |
| LanguageSwitch | "English" and "తెలుగు", each written in its own script |
| OfflineBanner | Shows when `navigator.onLine` is false |

Icons: `lucide-react` only. Size 20 in UI, 16 in chips, 24 in field apps, 64 to 96 in the scan result. Stroke 1.75.

## Motion

Only `transform` and `opacity`. CSS only, no animation library.

| Token | Value | Use |
| --- | --- | --- |
| `--dur-fast` | 120 ms | Hover, press, toggle, chip select |
| `--dur-base` | 200 ms | Expand, tab change, toast in, inline validation |
| `--dur-slow` | 320 ms | Sheet and dialog in, section enter, scan result |
| `--dur-hold` | 3 s | Press and hold (SOS), scan result auto reset |
| `--ease-out` | cubic-bezier(0.2, 0, 0, 1) | Everything that enters |
| `--ease-in` | cubic-bezier(0.4, 0, 1, 1) | Everything that leaves (80 percent of the enter duration) |

- Utilities: `animate-enter` (fade plus an 8 px rise), `press-scale` (0.98 while pressed), `animate-drain`, `duration-hold`.
- Lists stagger 30 ms per item, at most 6 items. Success draws a check once, no confetti.
- `prefers-reduced-motion: reduce`: transitions become opacity only, pulsing and the ticket band stop.

## UX behaviour

- **Loading:** skeleton for content, spinner only inside buttons. Never block the whole page for a partial update.
- **Optimistic UI:** allowed for read state and filters. Never for payment, activation, scan or booking.
- **Errors:** inline next to the cause. Keep the user's input. Never clear a form on error.
- **Confirmation:** destructive actions (cancel ticket, end trip, revoke scanner) use a dialog that states the consequence in numbers. Non destructive actions use undo in a toast.
- **Forms:** one column, labels above, Enter submits, the main button stays enabled and shows errors on press.
- **Navigation:** back returns to the previous scroll position. Filters, tabs and dates live in the URL.
- **Keyboard:** everything reachable, Esc closes overlays, focus moves to the new step's heading after a step change.
- **Offline (field apps):** a chip shows "Offline, n pings saved". Never a blocking error.

## Formats (via `packages/shared/src/format.ts`, locale aware)

| Thing | English example | Rule |
| --- | --- | --- |
| Time | 06:30 AM | `Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })` |
| Date | Tue, 23 Sep | Weekday short, day, month short |
| Money | ₹485 | `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })` when whole rupees, Indian grouping (₹1,23,456) |
| Duration | 5 h 40 min | Never "340 minutes" |
| Distance | 412 km | Whole km |
| Countdown | 5 days 08 hours 21 minutes | Plan sec 16 |
| Bus number | AP 39 Z 1234 | Spaces kept |
| Ticket code | APT-7K3M-Q9XD | Monospace, grouped in 4s, always copyable |
| Phone | +91 98xxxxx210 | Masked everywhere except the owner's own profile |

## Accessibility (plan sec 47)

- WCAG 2.2 AA minimum. Checked by axe in Playwright on every main page and by hand with a screen reader (TalkBack or NVDA) on the core journey.
- Focus ring: 2 px `--primary` outline, 2 px offset, on every interactive element. Never removed.
- Touch targets: 44 px minimum, 56 px in driver, conductor and scanner apps.
- Every page has one `h1`, landmarks (`header`, `nav`, `main`), a skip link, and `lang` set to `en` or `te`.
- Forms: labels, errors linked with `aria-describedby`, error summary at the top on submit, focus moves to the first error.
- Live regions: booking hold timer announces at 5, 2 and 1 minutes left. Scanner result is announced (`role="status"` or `role="alert"`).
- Colour is never the only signal: status always has a label and icon, seat states have shapes, map markers have icons.
- Text resizes to 200 percent without loss. No text in images.

## Do not

- No hardcoded colours, sizes or strings.
- No ALL CAPS body text. Allowed only for the scanner result word (VALID, INVALID) and ticket codes.
- No placeholder text as the only label.
- No more than one primary button in view.
- No modal on top of a modal.
- No disabled button without a visible reason.
- No toast for an error the user must act on.
- No infinite spinners: after 10 s show the error state with Retry.
- No layout shift: reserve space for images, maps, QR and async numbers.
- No shadows on cards, no gradients, glass, emoji, stock photos or illustrations.
- No ads or promotions near booking, tickets, scanning, tracking or safety info (plan sec 45).
- No em dash or en dash in any copy.

## QA checklist (every screen, before the PR)

- 360, 390, 768 and 1280 px: no horizontal scroll, nothing clipped, targets meet the minimum.
- Light, dark by system, dark by choice. English and Telugu (long words wrap, no untranslated keys).
- Keyboard only (order, focus visible, Esc closes, focus returns). Screen reader. Zoom 200 percent. Reduced motion.
- Four states: loading, empty, error with retry, success. Edge data: zero, one, 500 items, long names, Rs 0 and Rs 15,000.
- Only one filled primary button in view. No raw hex, arbitrary values or inline styles. axe: no serious or critical violations.
