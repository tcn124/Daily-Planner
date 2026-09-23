# Weekly Planner

A weekly student planner. Assignments, events, and multi-day recurring bars
across a scrolling day window, plus a sidebar, a list view, a day page, and a
to-do strip.

It runs two ways from one codebase: a native macOS app, and an installable web
app for the phone — see [On your phone](#on-your-phone).

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

## On your phone

The phone version is the same app, installed to the home screen from Safari
rather than from a `.dmg`. It is a **PWA**: a web page with a manifest and a
service worker, which together let iOS give it an icon, run it without browser
chrome, and open it with no network at all.

It is not a shrunk-down desktop. Below 900px the app renders a different shell
entirely — three tabs (Week · List · Planner), bottom sheets instead of
popovers, swipe actions on rows, and no window chrome. The desktop components
are untouched by it.

```bash
npm run build:pwa
```

Writes `dist-pwa/`. That is a **second build mode**, not a replacement: the
default `npm run build` still writes `dist/` with a relative base, which is what
Tauri loads off disk. A service worker's scope and a manifest's `start_url` are
absolute by nature, so the PWA build sets `base: '/'` — and therefore
`dist-pwa/index.html` will *not* open straight from Finder the way `dist/` does.
That is the trade, and it is why the two have separate output directories.

To check it locally before deploying:

```bash
npm run preview -- --mode pwa --port 4173
```

### Putting it online

Any static host works; it is a folder of files. Cloudflare Pages is free and
does not need a build step, since `dist-pwa/` is already built:

```bash
npx wrangler pages deploy dist-pwa --project-name weekly-planner
```

The first run opens a browser to log in to Cloudflare and offers to create the
project. After that it prints a `*.pages.dev` URL.

**It has to be HTTPS.** Service workers are refused on plain HTTP from anywhere
except `localhost`, and without one there is no offline and no install prompt.
Any of the usual hosts give you HTTPS for free.

### Installing it

On the iPhone, open the URL in **Safari** — not Chrome, which cannot install web
apps on iOS — then **Share → Add to Home Screen**. It gets the app icon, opens
full-screen with no address bar, and works in airplane mode.

Reinstalling is how it updates if the service worker ever gets stuck; normally a
new deploy is picked up on the next launch.

### What is missing on the phone

- **Screenshot and PDF import.** The text recognition is Apple's Vision
  framework, called from the Rust side. There is no equivalent in a web page, so
  the entry points stay behind `isTauri()`.
- **Syncing with the Mac.** Not yet built. The phone and the desktop are separate
  stores, as the desktop and the browser already are — use **Export backup** to
  move data between them for now. The groundwork is done: `PlannerState` holds
  only content, and everything about *where a device is looking* lives apart
  from it in `planner.device.v1`, so syncing the planner will not drag one
  screen's scroll position onto another.

## Using it

| Action | How |
| --- | --- |
| Move the window one day | `‹` / `›` in the header, or the ← / → arrow keys |
| Jump to today | **Today** in the header re-anchors the current view on today, without changing the day count |
| Focus on today alone | **Today** in the sidebar is a tab: it drops the week to a single column on today. Picking **Week** or **List** again puts the day count back where it was, and so does setting a count by hand. The borrowed count is remembered across a restart |
| Add an assignment or event | Hover a day cell and click **+ Add**, or **New item** in the header. A **Title** is what the card shows; **Details** (pages, prompt, where to submit) sit under it in small type, clamped to two lines |
| Edit an item | Click the card body. Clicking anywhere outside the editor (or pressing Escape) cancels it |
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
| Import assignments from screenshots or PDFs | Paste (⌘V), drop the files on the window, or **Import screenshot** in the sidebar — several at once is fine — then check the rows and press **Import**. See [Screenshot import](#screenshot-import) |
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
the browser version keeps a separate one in the browser profile, and the
installed phone app a third. None of them share data yet — see
[On your phone](#on-your-phone).

A second key, `planner.device.v1`, holds what that device is *looking at* —
which day, how many columns, which tab, how tall the bands are. It is
deliberately kept out of `planner.v1`, because that is the half that will sync
one day, and scrolling a phone to Friday must not scroll the Mac to Friday.

Use **Export backup** in the sidebar (or **Edit planner → Export JSON**) for a
real backup, and **Import JSON** to restore it or move to another machine. Both
open native macOS save/open panels in the desktop app, and fall back to browser
downloads when running `npm run dev`.

### Screenshot import

A screenshot of a Canvas calendar or assignment list, or a syllabus PDF, can be
turned into planner items. Paste with ⌘V (⌘⇧⌃4 captures straight to the
clipboard), drop the files on the window, or pick them with **Import
screenshot** — any mix of images and PDFs, as many as you like. The text is
read on this Mac with Apple's Vision framework (PDF pages are rasterised first,
so a scanned syllabus works as well as a typed one) — nothing is uploaded — and
every row lands in a review table first, labelled with the file and page it
came from, where the date, time, subject, and band can be corrected and
unwanted rows unticked. The same assignment read from two overlapping
screenshots appears once. Nothing is saved until **Import** is pressed.

Two layouts are recognised, page by page: a **month grid** (day numbers mark
the cells, the heading gives the month) and a **list** (each row has a date,
or sits under a date heading; a time on its own line attaches to the row
above). Subjects are guessed from the text — a course code like `ECON 201`
maps to Economics, and a course named at the top of a document's first page
covers every row in it that names none — and the words *lecture*, *class*,
*meeting* and the like put a row in Events.

Assignments are also given a short, uniform title by kind, with the original
line kept as the details: "Read Smith, Wealth of Nations pp. 1-20" becomes
**Reading - Smith, Wealth of Nations 1–20**, "ECON 201 Problem Set 3" becomes
**Problem Set 3**, "Essay on Hamlet" becomes **Essay - Hamlet**. Kinds
recognised: Exam, Quiz, Presentation, Project, Problem Set, Homework, Lab,
Essay, Response, Reading. Lines that fit none are left as they are, and both
the title and details are editable in the review table before import. Dates
without a year resolve to the nearest one, so a January due date read in
September lands next year. For the best read, crop tightly to the calendar or
list and keep the month heading in view. If no dates are found at all, the raw
text is shown so it is clear what was read.

Desktop only — the browser build has no native side, so its entry points are
hidden.

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
  lib/ocr.ts            on-device text recognition (invoke), image intake helpers
  lib/ocrParse.ts       turns OCR lines into candidate items: layout, dates, subjects
  lib/categorize.ts     splits an imported assignment into a kind-based title and details
  lib/useIsMobile.ts    the 899px breakpoint, as a hook
  lib/pwa.ts            registers the service worker — never inside the desktop shell
  store/devicePrefs.ts  per-device view state, kept out of the synced planner
  components/mobile/    the phone shell: three tabs, sheets, swipe rows, gestures
  styles/
    tokens.css          colors, type scale, and geometry from the design canvas
    global.css          import hub — the files below, in cascade order
    base.css            reset, shared primitives (chip, checkbox, ✕, buttons)
    shell.css           sidebar, header, to-do strip
    week.css            day header, band headers, cells, cards, recurring
    list.css            list view
    day.css             day page
    overlays.css        composer, edit-planner panel, confirm dialog
    mobile.css          the phone layer — imported last, so it wins without edits above
  components/           one file per piece of UI (ScreenshotImport.tsx is the review table)
tools/ocr/parse-check.ts  sanity checks for the OCR parser: npx tsx tools/ocr/parse-check.ts
tools/ocr/fixtures/       real Vision output the checks replay
  assets/fonts/         DM Sans + Source Serif 4, vendored so the app works offline
public/                 copied verbatim into both builds
  manifest.webmanifest  name, icons, colours — what makes it installable
  icons/                home-screen icons, from tools/icons/make-pwa-icons.sh
  launch-mark.svg       the launch screen, shown until React's first render
src-tauri/
  tauri.conf.json       window size, bundle identifier, CSP
  capabilities/         which native APIs the frontend may call
  src/lib.rs            registers the dialog and fs plugins; drag_window, ocr_image, ocr_pdf commands
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

