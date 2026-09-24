import type { Item, PlannerState, RecurringItem, Subject, TodoItem } from '../types';
import type { RecordKind, Row } from './mapping';

type Sync = PlannerState['sync'];

function setDeleted(sync: Sync, key: string, at: number): Sync {
  return { ...sync, deleted: { ...sync.deleted, [key]: at } };
}

function clearDeleted(sync: Sync, key: string): Sync {
  if (!(key in sync.deleted)) return sync;
  const deleted = { ...sync.deleted };
  delete deleted[key];
  return { ...sync, deleted };
}

/** `${recurringId}:${date}` — neither half ever contains a colon. */
function splitTickId(id: string): [recurringId: string, date: string] {
  const sep = id.indexOf(':');
  return [id.slice(0, sep), id.slice(sep + 1)];
}

/**
 * What this device currently believes about `kind:id`'s last change, whether
 * that's a live record or a tombstone. A record neither held locally nor ever
 * tombstoned reads as `-Infinity` so any remote row for it — including a
 * remote tombstone — wins unconditionally: there is nothing here for it to
 * lose to.
 */
function localTimestamp(state: PlannerState, kind: RecordKind, id: string): number {
  const tombstoned = state.sync.deleted[`${kind}:${id}`];
  switch (kind) {
    case 'subject':
      return state.subjects.find((s) => s.id === id)?.updatedAt ?? tombstoned ?? -Infinity;
    case 'item':
      return state.items.find((i) => i.id === id)?.updatedAt ?? tombstoned ?? -Infinity;
    case 'recurring':
      return state.recurring.find((r) => r.id === id)?.updatedAt ?? tombstoned ?? -Infinity;
    case 'todo':
      return state.todos.find((t) => t.id === id)?.updatedAt ?? tombstoned ?? -Infinity;
    case 'note':
      return state.notes[id]?.updatedAt ?? tombstoned ?? -Infinity;
    case 'tick':
      return state.sync.ticks[id] ?? tombstoned ?? -Infinity;
  }
}

function applyTombstone(state: PlannerState, row: Row): PlannerState {
  const key = `${row.kind}:${row.id}`;
  switch (row.kind) {
    case 'subject':
      return {
        ...state,
        subjects: state.subjects.filter((s) => s.id !== row.id),
        sync: setDeleted(state.sync, key, row.updatedAt),
      };
    case 'item':
      return {
        ...state,
        items: state.items.filter((i) => i.id !== row.id),
        sync: setDeleted(state.sync, key, row.updatedAt),
      };
    case 'recurring':
      return {
        ...state,
        recurring: state.recurring.filter((r) => r.id !== row.id),
        sync: setDeleted(state.sync, key, row.updatedAt),
      };
    case 'todo':
      return {
        ...state,
        todos: state.todos.filter((t) => t.id !== row.id),
        sync: setDeleted(state.sync, key, row.updatedAt),
      };
    case 'note': {
      const notes = { ...state.notes };
      delete notes[row.id];
      return { ...state, notes, sync: setDeleted(state.sync, key, row.updatedAt) };
    }
    case 'tick': {
      const [recurringId, date] = splitTickId(row.id);
      const ticks = { ...state.sync.ticks };
      delete ticks[row.id];
      return {
        ...state,
        recurring: state.recurring.map((r) =>
          r.id === recurringId ? { ...r, doneDates: r.doneDates.filter((d) => d !== date) } : r,
        ),
        sync: setDeleted({ ...state.sync, ticks }, key, row.updatedAt),
      };
    }
  }
}

function applyLive(state: PlannerState, row: Row): PlannerState {
  const key = `${row.kind}:${row.id}`;
  // A live row for this key beats any tombstone this device was still
  // holding — the record exists again as far as the group is concerned.
  const sync = clearDeleted(state.sync, key);

  switch (row.kind) {
    case 'subject': {
      const d = row.data as { name: string; hue: number | null };
      const record: Subject = { id: row.id, name: d.name, hue: d.hue, updatedAt: row.updatedAt };
      const exists = state.subjects.some((s) => s.id === row.id);
      return {
        ...state,
        subjects: exists
          ? state.subjects.map((s) => (s.id === row.id ? record : s))
          : [...state.subjects, record],
        sync,
      };
    }
    case 'item': {
      const d = row.data as Omit<Item, 'id' | 'updatedAt'>;
      const record: Item = { ...d, id: row.id, updatedAt: row.updatedAt };
      const exists = state.items.some((i) => i.id === row.id);
      return {
        ...state,
        items: exists ? state.items.map((i) => (i.id === row.id ? record : i)) : [...state.items, record],
        sync,
      };
    }
    case 'recurring': {
      const d = row.data as { subjectId: string | null; title: string; startDate: string; endDate: string };
      const existing = state.recurring.find((r) => r.id === row.id);
      // `doneDates` is never in a recurring row's data — it's pushed one tick
      // record at a time — so an incoming update to the span's own fields
      // must not disturb whatever ticks this device already has for it.
      const record: RecurringItem = { ...d, id: row.id, doneDates: existing?.doneDates ?? [], updatedAt: row.updatedAt };
      return {
        ...state,
        recurring: existing
          ? state.recurring.map((r) => (r.id === row.id ? record : r))
          : [...state.recurring, record],
        sync,
      };
    }
    case 'todo': {
      const d = row.data as { text: string; done: boolean };
      const record: TodoItem = { id: row.id, text: d.text, done: d.done, updatedAt: row.updatedAt };
      const exists = state.todos.some((t) => t.id === row.id);
      return {
        ...state,
        todos: exists ? state.todos.map((t) => (t.id === row.id ? record : t)) : [...state.todos, record],
        sync,
      };
    }
    case 'note': {
      const d = row.data as { text: string };
      return { ...state, notes: { ...state.notes, [row.id]: { text: d.text, updatedAt: row.updatedAt } }, sync };
    }
    case 'tick': {
      const [recurringId, date] = splitTickId(row.id);
      return {
        ...state,
        recurring: state.recurring.map((r) =>
          r.id === recurringId && !r.doneDates.includes(date)
            ? { ...r, doneDates: [...r.doneDates, date] }
            : r,
        ),
        sync: { ...sync, ticks: { ...sync.ticks, [row.id]: row.updatedAt } },
      };
    }
  }
}

/**
 * Given local state and a batch of remote rows (a pull, or a realtime
 * event), produce the merged state. Per record: newer `updatedAt` wins, ties
 * keep local (so a device re-applying its own already-synced write is a
 * no-op); a tombstone is an ordinary row with `data: null`, so it wins
 * exactly when it's newer — no separate rule needed.
 *
 * Ticks need no union or special case here either: Phase 1 already made each
 * one its own tombstoned record (`sync.ticks` / `sync.deleted['tick:…']`), so
 * two devices ticking different days of one span never touch the same
 * `kind:id` and both survive through this same per-record path. What *does*
 * need care is ordering within a batch — a tick can arrive before the
 * `recurring` row it belongs to, so non-tick rows are applied first
 * regardless of the order the caller passed them in.
 */
export function mergeRows(local: PlannerState, remote: Row[]): PlannerState {
  const ordered = [...remote.filter((r) => r.kind !== 'tick'), ...remote.filter((r) => r.kind === 'tick')];
  let state = local;
  for (const row of ordered) {
    if (row.updatedAt <= localTimestamp(state, row.kind, row.id)) continue;
    state = row.data === null ? applyTombstone(state, row) : applyLive(state, row);
  }
  return state;
}
