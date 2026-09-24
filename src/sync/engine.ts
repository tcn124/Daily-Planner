import type { Dispatch } from 'react';
import type { Action } from '../store/plannerStore';
import type { PlannerState } from '../types';
import { supabase } from './client';
import { mergeRows } from './merge';
import { stateToRows, type RecordKind, type Row } from './mapping';
import { setSyncStatus } from './status';

const CURSOR_KEY = 'planner.sync.cursor.v1';
/** Coalesces a burst of edits into one push; short enough that "appears on
 *  the others within a second or so" (the plan's own goal) still holds once
 *  a network round trip is added on top. */
const PUSH_DEBOUNCE_MS = 600;

/** The `records` table's shape over the wire — snake_case, ISO timestamps. */
interface DbRecord {
  kind: RecordKind;
  id: string;
  data: Record<string, unknown> | null;
  deleted_at: string | null;
  updated_at: string;
}

function rowFromDb(r: DbRecord): Row {
  return { kind: r.kind, id: r.id, data: r.deleted_at ? null : r.data, updatedAt: Date.parse(r.updated_at) };
}

/**
 * `deleted_at`'s exact value is never compared — only `updated_at` (server
 * clock, trigger-owned) decides last-write-wins, so it's fine to stamp this
 * with the client's own clock. `updated_at` itself is never sent; the
 * trigger overwrites it unconditionally regardless.
 */
function rowToDb(row: Row, userId: string): Record<string, unknown> {
  return {
    user_id: userId,
    kind: row.kind,
    id: row.id,
    data: row.data,
    deleted_at: row.data === null ? new Date().toISOString() : null,
  };
}

function getCursor(): string | null {
  try {
    return localStorage.getItem(CURSOR_KEY);
  } catch {
    return null;
  }
}

function setCursor(ts: string | null): void {
  if (!ts) return;
  try {
    localStorage.setItem(CURSOR_KEY, ts);
  } catch {
    /* no-op */
  }
}

/** ISO 8601 strings from Postgres sort lexicographically the same as chronologically. */
function latestUpdatedAt(rows: { updated_at: string }[]): string | null {
  return rows.reduce<string | null>((max, r) => (!max || r.updated_at > max ? r.updated_at : max), null);
}

export interface SyncHandle {
  /** Tears down the auth listener, the realtime channel, and the `online` listener. */
  stop: () => void;
  /** Call on every local state change (already debounced upstream by the
   *  caller's own save effect is fine — this debounces again internally). */
  notifyLocalChange: (state: PlannerState) => void;
}

const NOOP_HANDLE: SyncHandle = { stop: () => {}, notifyLocalChange: () => {} };

/**
 * Starts the sync engine for one `PlannerProvider` lifetime. All state below
 * is local to this call — nothing module-level — so a second call (as
 * StrictMode's double-invoke produces) is fully independent of the first
 * rather than colliding with leftover state from it.
 *
 * UI reads status via `useSyncStatus()` (`status.ts`) rather than reaching in
 * here; this module only ever writes to it. `window.__sync` in dev builds is
 * still there for poking at it directly from the console — e.g.
 * `await window.__sync.reconnect()` to force a retry.
 */
export function startSyncEngine(getState: () => PlannerState, dispatch: Dispatch<Action>): SyncHandle {
  if (!supabase) return NOOP_HANDLE;
  const client = supabase;

  let currentUserId: string | null = null;
  let lastKnownRows = new Map<string, Row>();
  let pushTimer: ReturnType<typeof setTimeout> | null = null;
  let realtimeUnsub: (() => void) | null = null;

  function advanceLastKnownRows(state: PlannerState): void {
    lastKnownRows = new Map(stateToRows(state).map((r) => [`${r.kind}:${r.id}`, r]));
  }

  function diffChangedRows(state: PlannerState): Row[] {
    return stateToRows(state).filter((row) => {
      const prev = lastKnownRows.get(`${row.kind}:${row.id}`);
      return !prev || prev.updatedAt !== row.updatedAt;
    });
  }

  async function pushRows(rows: Row[], userId: string): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await client.from('records').upsert(
      rows.map((r) => rowToDb(r, userId)),
      { onConflict: 'user_id,kind,id' },
    );
    if (error) throw error;
  }

  /**
   * The offline queue: a failed push simply leaves `lastKnownRows` where it
   * was, so those same rows still show up as "changed" on the next call —
   * whether that's the next local edit or `reconnect()` after coming back
   * online. No separate persisted queue needed.
   */
  async function flushPending(state: PlannerState, userId: string): Promise<void> {
    const changed = diffChangedRows(state);
    if (changed.length === 0) return;
    try {
      await pushRows(changed, userId);
      advanceLastKnownRows(state);
      setSyncStatus({ phase: 'synced', lastSyncedAt: Date.now() });
    } catch {
      // Offline, or a transient Supabase error — left for the next attempt.
      setSyncStatus({ phase: 'offline' });
    }
  }

  function notifyLocalChange(state: PlannerState): void {
    if (!currentUserId) return;
    const userId = currentUserId;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      pushTimer = null;
      void flushPending(state, userId);
    }, PUSH_DEBOUNCE_MS);
  }

  async function pullAndMerge(localState: PlannerState, userId: string): Promise<PlannerState> {
    let query = client
      .from('records')
      .select('kind,id,data,deleted_at,updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: true });
    const cursor = getCursor();
    if (cursor) query = query.gt('updated_at', cursor);
    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) return localState;

    const merged = mergeRows(localState, data.map(rowFromDb));
    dispatch({ type: 'state/merge', state: merged });
    advanceLastKnownRows(merged);
    setCursor(latestUpdatedAt(data));
    return merged;
  }

  /**
   * The one irreversible moment in this design: a device's first connect
   * ever must never remove anything local, no matter what the server holds
   * or doesn't. Remote tombstones are dropped before merging — for a record
   * this device has never seen, a tombstone and content it wants kept are
   * indistinguishable, so the safe reading is always "kept" — and every
   * local record, synced or not, gets pushed up afterward so both sides end
   * up holding the union. A cursor existing at all is what "first" means
   * here, so this only ever runs once per device.
   */
  async function firstSync(localState: PlannerState, userId: string): Promise<PlannerState> {
    const { data, error } = await client
      .from('records')
      .select('kind,id,data,deleted_at,updated_at')
      .eq('user_id', userId);
    if (error) throw error;
    const rows = data ?? [];

    const liveRemote = rows.filter((r) => r.deleted_at === null).map(rowFromDb);
    const merged = mergeRows(localState, liveRemote);
    dispatch({ type: 'state/merge', state: merged });

    await pushRows(stateToRows(merged), userId);
    advanceLastKnownRows(merged);
    setCursor(latestUpdatedAt(rows));
    return merged;
  }

  function subscribeRealtime(userId: string): () => void {
    const channel = client
      .channel('records-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'records', filter: `user_id=eq.${userId}` },
        (payload) => {
          // Deletes are soft (`deleted_at`), so this is normally an UPDATE;
          // `old` is a fallback for the unlikely case of a hard delete.
          const record = (payload.new ?? payload.old) as DbRecord | undefined;
          if (!record) return;
          const row = rowFromDb(record);
          const merged = mergeRows(getState(), [row]);
          dispatch({ type: 'state/merge', state: merged });
          advanceLastKnownRows(merged);
          setCursor(record.updated_at);
          setSyncStatus({ phase: 'synced', lastSyncedAt: Date.now() });
        },
      )
      .subscribe();
    return () => void client.removeChannel(channel);
  }

  /**
   * Whichever of firstSync/pullAndMerge is appropriate, with status kept in
   * step and a network failure caught as "offline" rather than thrown.
   * Shared by sign-in and by `reconnect()` — a device that was offline
   * through its very first connect must still get the additive first-sync
   * treatment once it comes back, not an ordinary pull, so both callers have
   * to go through the same cursor check rather than one of them assuming
   * sync already happened once.
   */
  async function syncNow(userId: string): Promise<boolean> {
    const startState = getState();
    try {
      if (getCursor() === null) {
        setSyncStatus({ phase: 'first-sync' });
        await firstSync(startState, userId);
      } else {
        await pullAndMerge(startState, userId);
      }
      setSyncStatus({ phase: 'synced', lastSyncedAt: Date.now() });
      return true;
    } catch {
      setSyncStatus({ phase: 'offline' });
      return false;
    }
  }

  /** Pull-then-merge before flushing, so a queued offline write can never
   *  clobber something newer that arrived on the server while this device
   *  was gone. */
  async function reconnect(): Promise<void> {
    if (!currentUserId) return;
    const userId = currentUserId;
    if (!realtimeUnsub) realtimeUnsub = subscribeRealtime(userId);
    const ok = await syncNow(userId);
    if (ok) await flushPending(getState(), userId);
  }

  async function onSignedIn(userId: string, email: string | null): Promise<void> {
    currentUserId = userId;
    setSyncStatus({ email });
    // Subscribed before the initial pull, not after: a change that lands on
    // the server mid-pull would otherwise fall in the gap between "the pull
    // query ran" and "the subscription was registered." Applying the same
    // row twice — once from the pull, once from the realtime event — is
    // harmless, since `mergeRows` is idempotent (equal timestamps keep local).
    // Subscribing while still offline is fine too; supabase-js's realtime
    // client retries its own connection on its own.
    realtimeUnsub = subscribeRealtime(userId);
    await syncNow(userId);
    // Local edits made while the await above was in flight wouldn't have had
    // a `currentUserId` to push against yet — catch them up now. By this
    // point the merge dispatch above has long since committed, so `getState()`
    // reflects it plus anything edited locally in the meantime. Harmless (and
    // silently a no-op) if `syncNow` failed — there's nothing new to push.
    void flushPending(getState(), userId);
  }

  function onSignedOut(): void {
    currentUserId = null;
    realtimeUnsub?.();
    realtimeUnsub = null;
    if (pushTimer) {
      clearTimeout(pushTimer);
      pushTimer = null;
    }
    // Local data and the cursor both stay — signing out only stops syncing.
    setSyncStatus({ phase: 'signed-out', email: null, lastSyncedAt: null });
  }

  // `onAuthStateChange` fires immediately with the current session and again
  // on every change (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, …). Only act on
  // an actual identity change — a token refresh fires with the same user id
  // and would otherwise re-run the pull and re-subscribe for no reason.
  let lastSeenUserId: string | null = null;
  const { data: authListener } = client.auth.onAuthStateChange((_event, session) => {
    const userId = session?.user.id ?? null;
    if (userId === lastSeenUserId) return;
    lastSeenUserId = userId;
    if (userId) void onSignedIn(userId, session?.user.email ?? null);
    else onSignedOut();
  });

  // Configured but not yet resolved by the auth listener above (which fires
  // very soon after, but not synchronously) — default to "show the sign-in
  // form" rather than leaving the UI blank for that gap.
  setSyncStatus({ phase: 'signed-out' });

  const onOnline = () => void reconnect();
  const onOffline = () => {
    if (currentUserId) setSyncStatus({ phase: 'offline' });
  };
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);

  if (import.meta.env.DEV) {
    (window as unknown as { __sync?: unknown }).__sync = {
      supabase: client,
      pull: () => (currentUserId ? pullAndMerge(getState(), currentUserId) : Promise.resolve(getState())),
      reconnect,
      cursor: getCursor,
    };
  }

  return {
    notifyLocalChange,
    stop: () => {
      authListener.subscription.unsubscribe();
      realtimeUnsub?.();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      if (pushTimer) clearTimeout(pushTimer);
    },
  };
}
