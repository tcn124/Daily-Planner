# Weekly Planner

A weekly student planner. Assignments, events, and multi-day recurring bars
across a scrolling day window, plus a sidebar, a list view, a day page, and a
to-do strip.

The interface follows the design canvas in `design/` — see [Design](#design).

## Requirements

- **Node.js 18+** — install from <https://nodejs.org/>
- **Rust** — install with `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`

Xcode is *not* needed; Command Line Tools is enough. Verify with:

```bash
node --version && rustc --version
```

## Run it

The planner is a Tauri desktop app — a native macOS window, no browser and no
dev server. Open **Weekly Planner** from `~/Applications` or the Dock.

### Working on it

```bash
npm run tauri:dev
```

Opens the native window with hot reload — edits to `src/` appear immediately.

The browser version still works too, which is often quicker for UI work since
you get devtools:

```bash
npm run dev
```

That serves <http://localhost:5173>. Note the two keep **separate data**: the
desktop app and the browser are different storage origins, so items added in one
do not appear in the other.

### Building the app

```bash
npm run tauri:build
```

Produces `src-tauri/target/release/bundle/macos/Weekly Planner.app` and a `.dmg`.
Copy the `.app` to `~/Applications` to install it.

The app is unsigned, which is fine here — locally built apps carry no quarantine
attribute, so macOS opens them without complaint. Signing only matters if you
move it to another Mac.

## Using it

| Action | How |
| --- | --- |
| Move the window one day | `‹` / `›` in the header, or the ← / → arrow keys |
| Jump to today | **Today** in the header, or **Today** in the sidebar |
| Add an assignment or event | Hover a day cell and click **+ Add**, or **New item** in the header |
| Edit an item | Click the card body |
| Move an item between bands | Open it and change **Band** in the composer |
| Complete an item | Click the checkbox — the card dims and strikes through |
| Delete an item | Hover it and click the ✕ beside the checkbox |
| Add a recurring bar | Click and drag across the Recurring row; it snaps to whole days |
| Resize a recurring bar | Drag either end |
| Move a recurring bar | Drag its body to other days; it keeps its length |
| Tick off one day of a recurring bar | The checkbox under that day — the bar reads as done once every day is ticked |
| Move an item to another day | Drag its card (or its row in the list) onto the day |
| Collapse a band | Click its section header |
| Resize the bands | Drag the top edge of a band header; double-click to reset |
| Open a single day | Click a day name in the header row |
| Note on a day | The notes box at the foot of the day page |
| Add a to-do note | **+ Add note** in the To-Do strip, then Enter |
| Switch views | **Week** / **List** in the sidebar — the list shows every day that has something on it, with no window, and opens scrolled to today |
| Group or sort the list | **Group** / **Sort** in the list header |
| Reschedule everything overdue | **Reschedule all →** under Missed in the sidebar |
| Days shown in the week | The **− / +** stepper in the header (or in Edit planner), anywhere from 1 to 14 |
| Subjects, day count, backups | **Edit planner** at the foot of the sidebar |

The sidebar lists each subject with a live item count, and collects anything
still open whose day has passed under **Missed** — each can be ticked off or
deleted right there, and clicking its name jumps to that day.

Subjects can be created inline from the composer's subject row via **+ New**, or
managed in the Edit planner panel. Each subject is defined by a single hue — see
[Design](#design) for how the chip and dot colours are derived from it.

## Data

Everything saves automatically as you work, under the key `planner.v1`. The
desktop app keeps its store in `~/Library/WebKit/com.carternishi.weeklyplanner`;
the browser version keeps a separate one in the browser profile. The two do not
share data.

Use **Export backup** in the sidebar (or **Edit planner → Export JSON**) for a
real backup, and **Import JSON** to restore it or move to another machine. Both
open native macOS save/open panels in the desktop app, and fall back to browser
downloads when running `npm run dev`.

Destructive actions — deleting a subject, replacing everything on import, and
**Reset all data** — ask for confirmation in an in-app dialog. `window.confirm`
is deliberately not used: embedded webviews suppress it (it returns false
without ever showing, silently blocking the action) and Tauri's WebView returns
true without showing, which would bypass the guard entirely.

## Layout of the code

```
src/
  types.ts              shared shapes
  lib/dates.ts          ISO date math, window building, formatting
  store/
    plannerStore.tsx    reducer + context, the single source of truth
    persistence.ts      localStorage, export, import
    defaults.ts         seed subjects and swatches
  lib/oklch.ts          OKLab/OKLCH ↔ sRGB, with a gamut clamp
  styles/
    tokens.css          colors, type scale, and geometry from the design canvas
    global.css          import hub — the files below, in cascade order
    base.css            reset, shared primitives (chip, checkbox, ✕, buttons)
    shell.css           sidebar, header, to-do strip
    week.css            day header, band headers, cells, cards, recurring
    list.css            list view
    day.css             day page
    overlays.css        composer, edit-planner panel, confirm dialog
  components/           one file per piece of UI
  assets/fonts/         DM Sans + Source Serif 4, vendored so the app works offline
src-tauri/
  tauri.conf.json       window size, bundle identifier, CSP
  capabilities/         which native APIs the frontend may call
  src/lib.rs            registers the dialog and fs plugins
  icons/                generated by `tauri icon`
```

## Design

The visual language comes from the design canvas in `design/` — `Main Page.dc.html`
for the week grid, `Supporting Screens.dc.html` for the list view, day page,
composer and edit-planner panel. Those two files are the source of truth for
every size and colour; read the inline `style="…"` attributes for exact values.

It is one ink colour at varying alpha over warm surfaces: `#37352f` on `#fff`,
`#f7f7f5` and `#fcfcfb`, with borders from `rgba(55,53,47,0.07)` to `0.12`.
Items are white cards with a 1px border, a 6px radius and a pale subject chip.
Chrome is DM Sans; the mastheads are Source Serif 4. Weeks start on Monday.

Values in `tokens.css` were measured from the canvas rather than eyeballed — the
236px sidebar, 52px collapsed rail, 30px band headers, 52px to-do strip, 6px card
radius and 8px/9px card padding all come straight from the source.

### Subject colours

Subjects store a single hue (0–359) and every colour is derived from it, so any
new subject fits the system automatically:

| Role | Derivation |
| --- | --- |
| Chip background | `oklch(94.6% 0.021 H)` |
| Chip text | `oklch(41.2% 0.089 H)` |
| Sidebar dot, recurring bar edge | `oklch(61.2% 0.123 H)` |
| Row hover tint | `oklch(97% 0.012 H)` |

`H` is the stored hue mapped onto the OKLCH wheel by `hslHueToOkHue` in
`src/lib/oklch.ts`; subjects with no hue fall back to neutral grey.

The derivation is done in OKLCH rather than HSL because HSL cannot hold a
consistent perceptual weight across hues — at a fixed saturation, `hsl(h 100% 85%)`
reads far lighter at yellow than at blue. Across the canvas's four subjects the
measured HSL saturations swing 32 → 78, while in OKLCH the same swatches sit at
near-constant lightness and chroma, which is what makes one formula viable.

The constants above are fitted to **minimise the worst-case** error rather than
the average: the canvas's own swatches are hand-picked and not internally
consistent (their chip-ink chroma alone ranges 0.077–0.124), so no single
constant reproduces all four exactly. Minimax keeps every subject equally close
instead of matching two and visibly missing the others.

Colours are emitted as hex from JS, not as CSS `oklch()`, so the out-of-gamut
clamp stays under our control — naive per-channel clipping turns a saturated
orange into a visibly wrong brown.

