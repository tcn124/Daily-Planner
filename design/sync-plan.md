# Sync plan — desktop ⇄ phone, live

**For whoever picks this up:** this is written to be executed in a fresh
session with no prior context. Read `CLAUDE.md` at the repo root first — it is
the working map for the codebase and it is current. This file only covers what
is being added.

Repo: `/Users/carternishi/Claude Code/Project 1` (`github.com/tcn124/Daily-Planner`).

---

## The goal

One planner, three places it can be edited: the macOS app, the installed
phone app, and a browser tab. Today each has its own `localStorage` and they
never meet. After this, a change on any of them appears on the others **within
a second or so, without either being reopened**.

The user asked for immediate sync explicitly. That word is doing work: it rules
out a poll-on-launch design and it is why this plan lands on Supabase.

---

## Decisions already made

Do not relitigate these; they were chosen deliberately.

| Decision | Why |
|---|---|
| **Supabase** (Postgres + Realtime + Auth) | Live updates over a WebSocket, auth, and row-level security in one free service. The alternative, Cloudflare Durable Objects, is on the same account as the existing Pages deploy but means hand-writing the socket server, the auth and the storage. |
| **Per-record last-write-wins**, not document LWW | Document-level LWW loses the realistic conflict: tick something off on the phone, open the Mac later, and the Mac's stale copy silently overwrites the tick. |
| **Not a CRDT** | Automerge/Yjs solve multi-writer text convergence. This is one person on two devices editing disjoint records; per-record LWW plus a set-union for the one field that needs it is the honest amount of machinery. |
| **Local-first** | `localStorage` stays the source of truth for rendering. The app already has to work offline — it is an installed PWA with a precaching service worker — so sync is a background reconciler, never something a render waits on. |
| **The server owns the clock** | `updated_at` is set by a Postgres trigger, never by the client. Two devices with skewed clocks would otherwise resolve LWW in the wrong direction. |
| **First sign-in is additive — it never deletes** | The user's decision, and it is not negotiable. See below. |

### First sign-in: keep everything, delete nothing

The first connect is the one irreversible moment in this whole design, and the
user has decided it explicitly: **whatever is already on the Mac stays.**

Concretely, on a device's first successful sync:

- Push every local record up. Local data is **never** removed to match the
  server, no matter what the server holds.
- Pull every remote record down and add anything not held locally.
- Where the same id exists on both, keep the newer `updatedAt` — and because
  Phase 1 stamps migrated records `0`, "newer" means the server wins a tie.
  That only ever rewrites *fields* of a record that exists on both sides; it
  never removes a record.
- **Ignore tombstones on a first sync.** A tombstone from another device for a
  record this device has never seen is indistinguishable from data the user
  wants kept. Apply tombstones only from the second sync onward, once a cursor
  exists.

The failure this rules out: signing in on the Mac and watching a term's work
vanish because the phone's near-empty planner was treated as authoritative.
When in doubt during implementation, keep the record.

---

## Where the code is now

Enough to plan against; verify before changing.

- **State**: one `useReducer` + context in `src/store/plannerStore.tsx`. Every
  mutation is an `Action` variant. `PlannerState` is **content only** —
  `version, subjects, items, recurring, todos, notes` — because it was already
  shaped for this: view state was split out into `src/store/devicePrefs.ts`
  (`planner.device.v1`) so a phone scrolled to Friday cannot scroll the Mac to
  Friday. **That half is done. Do not sync `devicePrefs`.**
- **Persistence**: `src/store/persistence.ts`, key `planner.v1`, debounced 200ms
  with a synchronous flush on `pagehide`/`visibilitychange`. `loadState`
  shape-checks and runs migrations in place — follow that established pattern
  for the new fields rather than inventing another.
- **Shapes** (`src/types.ts`), all of which need timestamps:

  ```ts
  Subject      { id, name, hue }                        // no timestamp
  Item         { id, type, subjectId, description,
                 details, time, date, done, createdAt } // createdAt only
  RecurringItem{ id, subjectId, title, startDate,
                 endDate, doneDates: string[] }         // no timestamp
  TodoItem     { id, text, done }                       // no timestamp
  notes        Record<'YYYY-MM-DD', string>             // nowhere to hang one
  ```

- **Two build modes**: `npm run build` (desktop, `dist/`) and
  `npm run build:pwa` (phone, `dist-pwa/`). Both matter here — see Gotchas.

---

## The hard part is the data model, not the transport

Roughly 60% of this work is Phase 1. Budget accordingly.

### Every record needs `updatedAt`

Stamped in the reducer on every mutation that touches it. Without it there is
nothing to compare and LWW is meaningless.

### Deletes need tombstones

`item/delete` currently drops the record from the array. If the phone deletes
and the Mac has not heard, the Mac's copy **resurrects it** on the next sync.

Keep tombstones *out* of the rendered arrays — putting deleted records back in
`items` would force every consumer (`src/lib/listRows.ts`, `src/lib/missed.ts`,
`WeekView`, the mobile rows) to learn to filter. Use a side map instead, purged
after ~30 days.

### `notes` has nowhere to put a timestamp

`Record<ISO, string>` becomes `Record<ISO, { text, updatedAt }>`. Small blast
radius — the reducer's `note/set` case plus exactly two readers,
`src/components/DayPage.tsx:224` and
`src/components/mobile/MobileWeek.tsx:428`. Migrate with the existing
`migrateNotes` helper.

### `recurring.doneDates` is the one field LWW gets wrong

It is a `string[]`. Tick Monday on the phone and Tuesday on the Mac, and
record-level LWW keeps one tick and drops the other — a silent data loss on the
app's single most common action.

**Fix: promote each tick to its own record.** One row per
`(recurringId, date)`, present means done, tombstoned means not. Ticks then
merge by set union for free and two devices can never collide.

Keep `doneDates: string[]` as the *local* shape so the ~15 existing call sites
keep working; the sync layer translates. Per-tick timestamps live alongside the
tombstones.

### Suggested local additions

```ts
// On PlannerState. Never rendered; stripped from backups the way `settings`
// already is in `stripSettings`.
sync: {
  /** `${kind}:${id}` → when it was deleted. Purged after 30 days. */
  deleted: Record<string, number>;
  /** `${recurringId}:${date}` → when that tick last changed. */
  ticks: Record<string, number>;
}
```

Plus `updatedAt: number` on `Subject`, `Item`, `RecurringItem`, `TodoItem`.

---

## Phase 0 — Supabase setup (needs the user)

**This phase cannot be done for them.** It needs their account. Stop and ask;
do not create an account on their behalf, and never ask them to paste a service
role key.

1. They create a free project at [supabase.com](https://supabase.com).
2. They run this in the SQL editor:

```sql
create table public.records (
  user_id    uuid not null references auth.users on delete cascade,
  kind       text not null check (kind in ('subject','item','recurring','todo','note','tick')),
  id         text not null,
  data       jsonb,
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);

alter table public.records enable row level security;

create policy "own rows" on public.records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- The server owns the clock: never trust a device's idea of "now" for LWW.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger records_touch before insert or update on public.records
  for each row execute function public.touch_updated_at();

-- Pulls are "everything newer than my cursor".
create index records_user_updated on public.records (user_id, updated_at desc);

alter publication supabase_realtime add table public.records;
```

3. **Auth → Providers**: enable Email, turn **off** email confirmation, create
   the one account, then **turn off public signups**. Magic links are the
   alternative but the free tier's built-in SMTP is rate-limited to a handful
   of mails an hour, which is miserable to develop against.
4. They give you the **project URL** and the **anon key**. The anon key is
   designed to ship in a client and is safe with RLS on — it is not a secret.
   The `service_role` key is the opposite: never put it in this app.
5. `.env` (gitignored — `.gitignore` exists at the repo root), plus a committed
   `.env.example`:

   ```
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ```

   Vite only exposes `VITE_`-prefixed vars, and they are baked in at build time
   for **both** build modes.

**If the vars are absent the app must run exactly as it does today** — no
errors, no sync UI, nothing. That property is what keeps every phase below
shippable on its own.

---

## Phase 1 — data model

No network. Entirely verifiable on its own.

1. Add `updatedAt` to `Subject`, `Item`, `RecurringItem`, `TodoItem`; change
   `notes` to `Record<ISO, { text, updatedAt }>`; add the `sync` field.
2. Stamp `updatedAt` in **every** reducer case that mutates a record. Record
   deletions and tick changes into `sync`.
3. Migrate in `loadState`: missing `updatedAt` → `0` (so anything on the server
   wins over never-synced local data, which is the safe direction on first
   connect); string notes → `{ text, updatedAt: 0 }`; absent `sync` → empty.
4. Strip `sync` from exports in `exportState`, and drop it on import, the way
   `stripSettings` already handles legacy `settings`.
5. Purge tombstones older than 30 days on load.

**Done when:** `npm run build` type-checks, the app behaves identically, an
existing `planner.v1` from before the change still loads with its data intact,
and a backup exported before the change still imports.

---

## Phase 2 — the sync engine

New directory `src/sync/`. No UI yet; drive it from the console.

- **`client.ts`** — creates the Supabase client only when both env vars are
  present; exports `null` otherwise.
- **`mapping.ts`** — pure functions, `PlannerState` ⇄ rows. One row per record:

  | kind | id | data |
  |---|---|---|
  | `subject` | subject id | `{ name, hue }` |
  | `item` | item id | everything but `id`/`updatedAt` |
  | `recurring` | recurring id | `{ subjectId, title, startDate, endDate }` — **no `doneDates`** |
  | `tick` | `${recurringId}:${date}` | `{ recurringId, date }` |
  | `todo` | todo id | `{ text, done }` |
  | `note` | the ISO date | `{ text }` |

  Keep this pure and cover it with a checks script under `tools/`, the way
  `tools/ocr/parse-check.ts` covers the OCR parser. Round-tripping
  `state → rows → state` must be lossless.

- **`merge.ts`** — pure. Given local state and a set of remote rows, produce
  the merged state. Newer `updatedAt` wins per record; a tombstone beats an
  older edit; ticks union. **Pure and separately testable is the point** — this
  is where the data-loss bugs live, and you do not want to be debugging it
  through a WebSocket.

- **`engine.ts`** — push, pull, subscribe.
  - *Detecting local changes*: debounce, then **diff the current state against
    the last-pushed snapshot by id and `updatedAt`**. Do not thread
    change-tracking through every action — a diff cannot miss a mutation, and
    at a few hundred records it is free.
  - *Push*: upsert changed rows. Never send `updated_at`; the trigger owns it.
  - *Pull*: `updated_at > cursor`, ordered, cursor persisted.
  - *Subscribe*: `postgres_changes` on `public.records`, apply through the same
    `merge.ts`. Realtime is an optimisation over pull, not a second code path.
  - *Offline*: queue pushes and flush on reconnect. Pull-then-merge on
    reconnect before flushing, so a queued write never clobbers a newer remote.
  - Apply merged results via a new `state/merge` action, **not** `state/replace`
    — replace would stomp concurrent local edits.

**Done when:** two browser profiles pointed at the same account converge; a
change in one appears in the other without a reload; and offline edits on one
survive a reconnect while the other was also editing.

---

## Phase 3 — auth and the sync chrome

The design already specifies this UI and it is **already built and deliberately
left unrendered** — see `design/mobile-handoff.md`. Switch it on now that there
is something true to say:

- The Planner tab's "Synced with desktop · 2 min ago" line.
- The offline bar.
- The first-sync loading screen.

New, not in the design — a sign-in surface. Put it in the phone's
**Edit planner** sheet (`src/components/mobile/PlannerSheet.tsx`) and the
desktop's `src/components/SettingsPanel.tsx`, both under a "Sync" section:
signed-out shows email + password; signed-in shows the address, last-synced
time, and Sign out. Sign-out must keep local data — it stops syncing, it does
not erase the planner.

Follow the existing conventions: `ConfirmDialog`, never `window.confirm`; 44pt
minimum targets and 16px minimum inputs on the phone (`--m-fs-input`).

---

## Phase 4 — hardening and deploy

Two settings will break this silently if missed. Both have bitten this
codebase before.

1. **The Tauri CSP.** `src-tauri/tauri.conf.json:28` currently reads:

   ```
   default-src 'self'; connect-src 'self' ipc: http://ipc.localhost; ...
   ```

   The Supabase origin and `wss:` must be added to `connect-src` or every
   request and the WebSocket fail **inside the desktop app only**. A missing
   `connect-src` entry once silently degraded every Tauri invoke in this app,
   so verify it in the built `.app`, not just in `npm run dev`.

2. **The service worker must not cache the API.** Workbox precaches by glob in
   `vite.config.ts`. Supabase calls need an explicit NetworkOnly route or the
   phone will serve yesterday's planner from cache.

3. **A keep-alive ping, or the project pauses.** Free Supabase projects pause
   after ~7 days without database activity, and a paused project has to be
   restored by hand from their dashboard — silently stopping sync during
   exactly the long quiet stretch where nobody would think to check. One
   scheduled request a day keeps it out of the idle window permanently.

   It has to run somewhere always-on — not the user's Mac, which may be shut
   for the fortnight in question. Put it in a **Cloudflare Worker with a Cron
   Trigger**: the account already exists (the PWA deploys to Cloudflare Pages),
   cron triggers are free, and it is about ten lines.

   ```js
   export default {
     async scheduled(event, env) {
       // One request a day is enough; nothing reads the response.
       await fetch(`${env.SUPABASE_URL}/rest/v1/heartbeat?select=id&limit=1`, {
         headers: { apikey: env.SUPABASE_ANON_KEY },
       });
     },
   };
   ```

   with `crons = ["0 12 * * *"]`. Give it a `heartbeat` table with one row and
   an anon-readable policy, so the request is unambiguously database activity
   rather than something Supabase might not count.

   **Not GitHub Actions**, despite being the obvious free option: GitHub
   disables scheduled workflows on repos with no activity for 60 days, so the
   safety net would switch itself off during the same long gap that causes the
   pause.

Then: `npm run build:pwa`, redeploy, and re-test on the real iPhone —
two devices, one account, offline and back.

---

## Gotchas

- **Free Supabase projects pause after ~7 days of no activity** and must be
  restored by hand from the dashboard. Fine in term time; it *will* bite over a
  long vacation. The keep-alive ping in Phase 4 removes it entirely — treat that
  step as required, not optional.
- **`state/replace` already exists** for backup import and must stay
  replace-semantics. Merge needs its own action.
- **The 200ms debounced save and the `pagehide` flush** mean a write can land
  after an unload. Make sure a pull applied at startup cannot be overwritten by
  a stale flush.
- **Three storage origins, not two** — desktop, phone, and `npm run dev` in a
  browser. All three will now converge, which makes the browser tab a genuinely
  useful test rig for the first time.
- **StrictMode double-invokes effects.** The subscription must be idempotent;
  `devicePrefs.adoptLegacySettings` guards against exactly this pattern already.

---

## Verification

1. `npm run build` type-checks (there is no separate lint or test).
2. `npx tsx tools/ocr/parse-check.ts` still passes — it must be untouched by
   this work.
3. The new mapping/merge checks script passes.
4. A pre-sync `planner.v1` loads with data intact; a pre-sync backup imports.
5. Two browsers, one account: create, edit, tick, delete — each appears in the
   other without a reload.
6. Conflict: both offline, both edit the same item, both reconnect. The later
   edit wins and nothing else is lost.
6b. **First sign-in is additive.** Put a full term of data on the Mac and a
   near-empty planner on the phone, then sign both in. Nothing on the Mac is
   removed, and the union appears on both. Run this one before shipping — it is
   the case the user cares most about and the only one that cannot be undone.
7. Tick conflict: both offline, tick *different* days of one recurring span,
   reconnect. **Both ticks survive** — this is the case the tick-as-record
   design exists for.
8. Desktop regression: `npm run tauri:build`, install, confirm sync works in
   the `.app` (proves the CSP) and the week grid, composer, import and window
   drag are unchanged.
9. Phone: install from the deployed URL, airplane mode, edit, reconnect.

---

## Ask the user before starting

- Phase 0 credentials — they must create the Supabase project themselves.

First-sign-in behaviour is **already decided** — additive, never destructive.
See "First sign-in" above. Do not re-ask it and do not quietly implement a
replace because it is simpler.
