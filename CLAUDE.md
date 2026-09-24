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
npm run build:pwa    # the phone build → dist-pwa/ (base '/', service worker, manifest)
npm run tauri:build  # → src-tauri/target/release/bundle/macos/Weekly Planner.app + .dmg
```

There are no tests and no linter. `npm run build` is the type-check.
`npx tsx tools/ocr/parse-check.ts` runs the OCR parser's sanity checks — run it
after touching `src/lib/ocrParse.ts`. `npx tsx tools/sync/sync-check.ts` does
the same for `src/sync/mapping.ts` and `merge.ts` — run it after touching
either; see **Sync** below.
`.claude/launch.json` defines a `planner` preview config (port 5173) and a
`planner-pwa` one (port 4173) that serves the built PWA — a service worker needs
a real build, so the phone build cannot be checked from the dev server.
`tools/icons/make-pwa-icons.sh` regenerates `public/icons` from the app mark.

Browser, desktop and the installed phone app are **separate storage origins** —
data added in one does not appear in the others, until each is signed in to the
same Supabase account (see **Sync**).

`.env` (gitignored; `.env.example` is the committed template) holds
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. **Absent, the app runs exactly
as it does without sync** — no errors, no sync UI — so a checkout with no `.env`
is a perfectly normal way to work on everything else in this file.

## Architecture

- **State**: one `useReducer` + context in `src/store/plannerStore.tsx`. Every
  mutation is an `Action` variant (`item/*`, `recurring/*`, `todo/*`,
  `subject/*`, `note/set`, `state/replace`, `state/merge`, `state/reset`). Add
  new behaviour as a reducer case, not as component-local mutation. `item/add`
  and `recurring/add` accept an optional `id` (and `createdAt`) so an undone
  delete restores the record rather than a copy of it — `updatedAt` is never
  accepted, only ever stamped by the reducer, so a restore always outruns the
  tombstone it is undoing. `state/merge` carries the already-conflict-resolved
  result of `src/sync/merge.ts`; unlike `state/replace` (backup import, which
  must stay replace-semantics) it exists specifically so a pull can never stomp
  a concurrent local edit.
- **Device preferences** (`src/store/devicePrefs.ts`): everything about *where
  this device is looking* — `anchorDate`, `view`, `daysVisible`, `bandWeights`,
  `daysBeforeToday`, and the phone's `mobileDays`, `detailsVisible`, `tab`.
  Stored separately under `planner.device.v1`, read with `useDevicePrefs()`, and
  changed through named functions (`setAnchor`, `shiftAnchor`, `goToToday`,
  `setDays`, `setView`, `setBandWeights`, `focusToday`) rather than actions.
  `PlannerState` is content only, because it is the blob that will sync: a phone
  scrolled to Friday must not scroll the Mac to Friday. A new view field goes
  here and into `coerce`; a new *content* field goes in the planner.
- **Persistence** (`src/store/persistence.ts`): `localStorage` key `planner.v1`,
  debounced 200ms with a synchronous flush on `pagehide`/`visibilitychange`.
  `loadState` shape-checks and runs migrations in place (`color`→`hue`,
  `done`→`doneDates`, optional `notes`, missing item `details`→`''`, missing
  `updatedAt`→`0`, missing `sync`→empty). A new `Item` field needs a
  `migrateItems` default. A planner saved before the view state was split out
  still carries a `settings` object; `stripSettings` hands it to
  `adoptLegacySettings` and drops the field, so such a device reopens where it
  was left. A backup's view settings *and* `sync` bookkeeping are both dropped
  on import/export on purpose — importing someone's planner should not move
  your screen to their day or hand your device their tombstones.
- **Types** (`src/types.ts`): `Subject {hue|null, updatedAt}`, `Item
  {assignment|event, description (the title), details (specifics, clamped to 2
  lines on cards), date, time (free text), done, createdAt, updatedAt}`,
  `RecurringItem {startDate, endDate, doneDates[], updatedAt}` (done per day;
  fully done only when every day is ticked — but see **Sync** for why
  `doneDates` is not the whole story), `TodoItem {..., updatedAt}`, `notes:
  Record<ISO, {text, updatedAt}>` (sparse — blanks are deleted). `updatedAt` is
  stamped by the reducer, never by a caller; it is the sync layer's
  last-write-wins comparator, `0` meaning "never synced." `PlannerState.sync`
  (`{deleted, ticks}`) is device-local bookkeeping for the same purpose — never
  rendered, stripped from backups. There is no `Settings` in here; see
  **Device preferences**.
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
- **Today tab**: `focusToday()` drops the week to 1 column on today and stashes
  the previous count in `daysBeforeToday`; its non-null presence is what marks
  the tab active, so pressing Today twice must not overwrite it. `setView` and
  `setDays` clear it — the first restoring the count, the second taking over
  from it.
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

## Mobile (`src/components/mobile/`, `src/styles/mobile.css`)

Below `@media (max-width: 899px)` — the desktop's own minimum width — `App.tsx`
renders `<MobileShell>` instead of the sidebar and views. It is a different
shell, not a responsive one: different navigation, different components, no
window chrome. Desktop components are untouched by it.

- **Three tabs, no nested navigation**: Week · List · Planner, held in
  `devicePrefs.tab`. Everything else is a sheet over them. There is no Today
  tab — Week opens on today at one day.
- **Two row shapes on purpose**: flat rows at one day, the desktop card at two
  and three. At three days a column is ~120pt, close enough to the desktop's
  that its card is the right component.
- **Pinned header** (`useStickyHead`): the Week's masthead, strip, day row and
  column heads, and the List's masthead and controls, are each wrapped in one
  `.m-stickyhead` and pinned to the top of the pane. One wrapper, not one sticky
  element per piece — several would all stop at `top: 0` and pile up. Its
  measured height is published as `--m-sticky-h` on the pane; the List's day
  headers stick to that rather than to 0, and the open-on-today scroll uses it
  as `scroll-margin-top`. Anything added to a shelf changes its height, which is
  why the height is measured and not written down.
- **Sheets** (`Sheet.tsx`): one bottom-sheet primitive — scrim, drag to dismiss,
  focus trap, body-scroll lock — with `ItemSheet`, `ComposerSheet` and
  `PlannerSheet` inside it. Which one is open, and the undo toast, live in
  `SheetHost` (`sheets.tsx`); reach them with `useSheets()`. The affirmative
  action goes in the sheet *header*: the keyboard covers the bottom third.
- **Gestures**: `useSwipeX` flings a region horizontally (bands change the day,
  the strip changes the week); `SwipeRow` gives a one-day row its actions —
  right for done, left for Move and Delete. They are told apart by where the
  press lands: a `pointerdown` inside `[data-swipe-row]` belongs to the row.
  Both lock the axis on the first movement and never revisit it, and both
  swallow the click the browser synthesises when a drag ends — without that,
  every swipe is followed by a tap on whatever it swiped.
- **Undo, not confirmation**: `useRowActions` is the one place Done and Delete
  happen, so a swipe and the sheet behave identically. Only the genuinely
  unrecoverable things (deleting a subject, resetting) use `ConfirmDialog`.
- **44pt minimum.** Where a control is drawn smaller — chips, swatches,
  checkboxes — an absolutely positioned `::after` carries the target. Check the
  gap before widening one: overlapping targets mean the wrong one gets the tap.
- **16px minimum on every input**, or iOS zooms the page on focus and leaves the
  sheet half off screen. `--m-fs-input` exists to make that hard to forget.
- Two features exist only here: **Hide done**, and filtering the List by
  subject from the Planner tab.
- **Sync chrome lives only here too**: the Planner tab's "Synced with desktop"
  line (`MobilePlanner.tsx`, only rendered once `useSyncStatus()` has
  something true to say), and `MobileShell.tsx`'s offline bar and blocking
  first-sync overlay. The desktop `SettingsPanel` has the same sign-in surface
  but no equivalent bar/overlay — see **Sync**.

## Sync (`src/sync/`)

Live sync between the desktop app, the installed phone app, and any browser
tab, all signed in to the same Supabase account. The full design rationale —
why Supabase, why per-record last-write-wins instead of a CRDT, why ticks are
their own records — lives in `design/sync-plan.md`; this is the map for
touching the code, not a restatement of the why.

- **`client.ts`**: `supabase` is `null` when the env vars are absent (see
  **Commands**). Every other module here must keep treating that as "sync
  doesn't exist," not as an error to handle.
- **`mapping.ts`**: pure `PlannerState ⇄ Row[]` conversion. One row per record
  plus one tombstone row per `sync.deleted` entry; a recurring item's
  `doneDates` becomes one `tick` row per day rather than living in the
  `recurring` row itself — that promotion is what lets two devices tick
  different days of the same span without either write clobbering the other.
  `stateToRows`/`rowsToState` must stay lossless round-trip;
  `tools/sync/sync-check.ts` checks exactly that, plus the merge cases below.
- **`merge.ts`**: pure. `mergeRows(local, remote)` — newer `updatedAt` wins per
  `kind:id`, ties keep local, a tombstone is just a row with `data: null` so it
  wins on the same rule as any other write. Non-tick rows are applied before
  tick rows regardless of input order, since a tick can otherwise arrive before
  the `recurring` row it belongs to in the same batch.
- **`engine.ts`**: `startSyncEngine(getState, dispatch)` is called once from
  `PlannerProvider` (`plannerStore.tsx`) and returns a `SyncHandle` whose state
  is local to that call — StrictMode's double-invoke gets two independent
  instances, never shared module state. Push is debounced and diffs the
  current state against a `lastKnownRows` snapshot by `kind:id` + `updatedAt`;
  a failed push simply leaves that snapshot stale, which **is** the offline
  queue — no separate persisted queue exists. Pull is cursor-based
  (`planner.sync.cursor.v1`); realtime is `postgres_changes`, applied through
  the same `mergeRows`, subscribed *before* the initial pull so a change
  landing mid-pull can't fall in the gap (applying it twice is harmless —
  `mergeRows` is idempotent). **First sign-in ever on a device** (cursor
  absent) goes through `firstSync` instead of `pullAndMerge`: remote
  tombstones are dropped before merging, and every local record is pushed
  regardless of `updatedAt`, so nothing local can ever be removed by a first
  connect. This is the one irreversible moment in the whole design — see
  `design/sync-plan.md` before changing it.
- **`status.ts`** / **`useSyncAuth.ts`**: `useSyncStatus()` is the only way UI
  reads sync state (`unconfigured | signed-out | first-sync | offline |
  synced`) — components never reach into `engine.ts` directly. `useSyncAuth()`
  is the sign-in/out logic shared by the desktop `SettingsPanel` and the
  phone's `PlannerSheet`, which each render their own markup around it rather
  than sharing a component, the way the rest of those two panels already do.
- **The `records` table** (Supabase, one row per `kind:id`, `data jsonb`,
  `deleted_at`, server-trigger-owned `updated_at`) and its RLS policy are
  defined in `design/sync-plan.md`, not in this repo — there is no migrations
  folder. `cloudflare/heartbeat/` is a standalone Cloudflare Worker (its own
  `wrangler.toml`) that pings a `heartbeat` table once a day so the free-tier
  Supabase project doesn't pause from inactivity; deploy it with `wrangler
  deploy` from that directory, separately from the app itself.

## PWA (`vite.config.ts`, `src/lib/pwa.ts`, `public/`)

One source, two builds. `vite build` is the desktop one: `base: './'`, so Tauri
loads assets off disk and `dist/index.html` opens from Finder. `vite build
--mode pwa` is the phone one: `base: '/'`, because a service worker's scope and
a manifest's `start_url` are absolute, which gives up that property — hence a
separate `dist-pwa/` rather than overwriting the committed `dist/`.

- **The service worker must never register inside Tauri**, or the desktop app
  starts serving itself stale assets with no address bar to get past it.
  `registerServiceWorker` checks `import.meta.env.MODE` first, which is a
  build-time constant, so the whole body is dropped from the desktop bundle;
  the `isTauri()` check behind it is there for when that stops being true.
- `index.html` is shared by both builds. Everything in it resolves in each,
  because `public/` is copied into both — keep it that way rather than adding
  absolute paths that would 404 in the desktop app.
- **The launch screen is `#boot` in `index.html`**, not
  `apple-touch-startup-image`: Apple's wants an exact-size PNG per device and
  orientation and is unreliable on recent iOS. `App.tsx` removes it from an
  effect, which is the first point React guarantees the real UI is committed.
- A new asset that must work offline goes in `public/` and needs its extension
  in the workbox `globPatterns`.
- Workbox's `runtimeCaching` routes every `*.supabase.co` request as
  `NetworkOnly`. Precaching is for the app shell; a cached Supabase response
  would mean the phone quietly shows yesterday's planner instead of either the
  real answer or an honest network error.

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
  week → list → day → overlays → **mobile**. `mobile.css` is last so the phone
  layer wins without editing a desktop rule; its sizes come from the `--m-*`
  block in `tokens.css`.

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
  invoke silently falls back to JSON `postMessage`. The same directive also
  allowlists `https://*.supabase.co wss://*.supabase.co` for sync; a missing
  entry here once silently degraded every Tauri invoke in this app, so verify
  any future addition in the built `.app`, not just `npm run dev`.
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
