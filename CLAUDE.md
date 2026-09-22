# CLAUDE.md

Weekly Planner — a macOS desktop student planner. Tauri 2 shell around a
React 18 + Vite + TypeScript frontend. Repo: `github.com/tcn124/Daily-Planner`.

The README covers usage, install, and the design rationale in depth; this file
is the working map for editing the code.

## Commands

```bash
npm run dev          # browser at http://localhost:5173 (has devtools; quickest for UI work)
npm run tauri:dev    # native window with hot reload
npm run build        # tsc -b && vite build — run this to type-check; there is no separate lint/test
npm run tauri:build  # → src-tauri/target/release/bundle/macos/Weekly Planner.app + .dmg
```

There are no tests and no linter. `npm run build` is the type-check.
`npx tsx tools/ocr/parse-check.ts` runs the OCR parser's sanity checks — run it
after touching `src/lib/ocrParse.ts`.
`.claude/launch.json` defines a `planner` preview config (port 5173).

Browser and desktop are **separate storage origins** — data added in one does
not appear in the other.

## Architecture

- **State**: one `useReducer` + context in `src/store/plannerStore.tsx`. Every
  mutation is an `Action` variant (`item/*`, `recurring/*`, `todo/*`,
  `subject/*`, `settings/*`, `note/set`, `state/replace`, `state/reset`). Add
  new behaviour as a reducer case, not as component-local mutation.
- **Persistence** (`src/store/persistence.ts`): `localStorage` key `planner.v1`,
  debounced 200ms with a synchronous flush on `pagehide`/`visibilitychange`.
  `loadState` shape-checks and runs migrations in place (`color`→`hue`,
  `done`→`doneDates`, optional `notes`, optional `daysBeforeToday`, missing
  item `details`→`''`). A new `Item` field needs a `migrateItems` default. When you
  add a settings field, add it to `createInitialState` in `defaults.ts` **and**
  to the field-by-field rebuild in `loadState` — settings are rebuilt
  explicitly, not spread, so dropped fields don't linger.
- **Types** (`src/types.ts`): `Subject {hue|null}`, `Item {assignment|event,
  description (the title), details (specifics, clamped to 2 lines on cards),
  date, time (free text), done}`, `RecurringItem {startDate, endDate,
  doneDates[]}` (done per day; fully done only when every day is ticked),
  `TodoItem`, `notes: Record<ISO, string>` (sparse — blanks are deleted),
  `Settings {daysVisible 1–14, anchorDate, view 'grid'|'list', bandWeights,
  daysBeforeToday}`.
- **Dates** (`src/lib/dates.ts`): everything is a `'YYYY-MM-DD'` string.
  `parseISO` yields a local-noon `Date` to avoid DST rollovers. Weeks start
  Monday. Never construct `Date` objects for calendar math outside this file.
- **Views** (`src/App.tsx`): a `topbar` (window drag handle + sidebar toggle +
  a portal `slot`) over `Sidebar` + one of `WeekView` / `ListView` / `DayPage`.
  Each view portals its own header controls into the topbar slot. Day focus
  and sidebar collapse are ephemeral React state, deliberately not persisted.
- **WeekView**: a horizontally scrolling track with a 7-day `BUFFER` either
  side of the visible window. On `scrollend` it re-bases `anchorDate` and
  re-parks `scrollLeft` so the re-base is invisible. Scroll events within
  `ignoreScrollUntil` are ones we caused — mind this when touching anchor or
  day-count logic.
- **Today tab**: `settings/todayFocus` drops the week to 1 column on today and
  stashes the previous count in `daysBeforeToday`; its non-null presence is
  what marks the tab active. `settings/view` and `settings/days` clear it and
  restore the count.
- **Drag and drop** (`src/lib/dnd.ts`): HTML5 DnD with a custom MIME type
  and an enter/leave depth counter. Recurring bars use pointer events instead
  (`RecurringBand.tsx`). File drops (screenshot import) are told apart by the
  `Files` type in `useImageIntake` (`App.tsx`) and never reach those targets.
- **Screenshot / PDF import**: `ImportSource[]` (images and PDFs, several at
  once) → `ocr_image` / `ocr_pdf` (Rust, Vision; PDFs rasterised via PDFKit,
  one `OcrLine[]` per page) → `src/lib/ocrParse.ts` per page (pure: grid/list
  layout detection, date/time/subject guessing, `headerSubject` fallback for
  one-course documents; assignments then go through `src/lib/categorize.ts`,
  which makes a kind-based title — "Reading - Smith 1–20" — and keeps the
  line as details) → `ScreenshotImport.tsx` review table (dedupes by
  date+title) → `item/add` per ticked row. The parser is heuristic by design;
  keep it pure and covered by `tools/ocr/parse-check.ts`, which also replays
  real Vision output from `tools/ocr/fixtures/`. Desktop only — entry points
  are behind `isTauri()`.

## Styling

- Tokens live in `src/styles/tokens.css`, measured from the design canvas in
  `design/*.dc.html` — that canvas is the source of truth for sizes and
  colours. Read its inline `style` attributes for exact values before
  inventing new ones.
- One ink colour `#37352f` at varying alpha over warm surfaces. Chrome is
  DM Sans, mastheads are Source Serif 4 (both vendored in `src/assets/fonts`).
- Subject colours are derived from a single hue in OKLCH (`src/lib/oklch.ts`,
  `src/lib/color.ts`) and emitted as hex from JS — do not hand-write subject
  colours or use CSS `oklch()`.
- CSS files are imported in cascade order via `global.css`: base → shell →
  week → list → day → overlays.

## Native shell (`src-tauri/`)

- `lib.rs` registers the dialog and fs plugins and one custom command,
  `drag_window`. It synthesises an `NSEvent` and calls
  `performWindowDragWithEvent` because Tauri's `startDragging` silently fails
  on trackpad pressure events. The frontend calls it from a native `mousedown`
  listener in `useWindowDrag` (`App.tsx`) — not `data-tauri-drag-region`,
  which has been removed.
- `ocr_image` / `ocr_pdf` take the file as a **raw IPC body**
  (`tauri::ipc::Request`, `InvokeBody::Raw`) and return lines with boxes
  already flipped to a top-left origin. Raw bodies only work over the fetch-based IPC, which is why
  the CSP has `connect-src 'self' ipc: http://ipc.localhost` — without it every
  invoke silently falls back to JSON `postMessage`.
- Window is frameless: `titleBarStyle: Overlay`, `hiddenTitle: true`,
  `dragDropEnabled: false` (which is also what lets HTML5 file drops reach the
  page). `--brand-inset` leaves room for the traffic lights.
- Any new native API the frontend calls must be added to
  `capabilities/default.json`.
- macOS-only deps (`objc2-app-kit` etc.) are behind `cfg(target_os = "macos")`.

## Conventions

- Confirmations use the in-app `ConfirmDialog`, never `window.confirm` — it
  returns without showing in embedded webviews.
- Native file dialogs on desktop, `<a download>` / `<input type=file>` in the
  browser; branch on `isTauri()` from `src/lib/platform.ts`.
- Comments explain *why* (the codebase is dense with rationale comments);
  match that density rather than adding what-comments.
- `dist/` is committed build output and gets regenerated by `npm run build`;
  don't hand-edit it.
