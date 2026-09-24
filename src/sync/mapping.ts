import type { Item, PlannerState, RecurringItem, Subject, TodoItem } from '../types';

/** Matches the `kind` check constraint on the `records` table. */
export type RecordKind = 'subject' | 'item' | 'recurring' | 'todo' | 'note' | 'tick';

/**
 * The local, wire-format-agnostic shape of one `records` row. `updatedAt` is
 * milliseconds here even though Postgres stores `timestamptz` — `engine.ts`
 * converts at the boundary, so this module and `merge.ts` never parse dates.
 * `data: null` is a tombstone, exactly as the `deleted_at`-bearing row is on
 * the server; kept as a `data: null` sentinel here rather than a separate
 * `deleted_at` field so a tombstone and a live row are the same shape to
 * merge against — one fewer thing for `merge.ts` to branch on.
 */
export interface Row {
  kind: RecordKind;
  id: string;
  data: Record<string, unknown> | null;
  updatedAt: number;
}

/** `tick:${recurringId}:${date}` → `${recurringId}:${date}`, and every other kind's id is opaque. */
function tombstoneRecordId(key: string): { kind: RecordKind; id: string } {
  const sep = key.indexOf(':');
  const kind = key.slice(0, sep) as RecordKind;
  return { kind, id: key.slice(sep + 1) };
}

/**
 * The live (non-tombstoned) content of `state`, plus one tombstone row per
 * entry in `state.sync.deleted` — together the full set of rows this device
 * would push. Pure and total: every branch of `PlannerState` maps to a row
 * and back via `rowsToState`, which is what makes the round trip in
 * `tools/sync/sync-check.ts` meaningful.
 */
export function stateToRows(state: PlannerState): Row[] {
  const rows: Row[] = [];

  for (const s of state.subjects) {
    rows.push({ kind: 'subject', id: s.id, data: { name: s.name, hue: s.hue }, updatedAt: s.updatedAt });
  }

  for (const i of state.items) {
    const { id, updatedAt, ...data } = i;
    rows.push({ kind: 'item', id, data, updatedAt });
  }

  for (const r of state.recurring) {
    rows.push({
      kind: 'recurring',
      id: r.id,
      data: { subjectId: r.subjectId, title: r.title, startDate: r.startDate, endDate: r.endDate },
      updatedAt: r.updatedAt,
    });
    for (const date of r.doneDates) {
      const tickId = `${r.id}:${date}`;
      rows.push({
        kind: 'tick',
        id: tickId,
        data: { recurringId: r.id, date },
        // A tick set via `recurring/toggleDay` has its own timestamp; one that
        // arrived as part of a whole restored span (`recurring/add`, undo)
        // does not, so it falls back to the span's own.
        updatedAt: state.sync.ticks[tickId] ?? r.updatedAt,
      });
    }
  }

  for (const t of state.todos) {
    rows.push({ kind: 'todo', id: t.id, data: { text: t.text, done: t.done }, updatedAt: t.updatedAt });
  }

  for (const [date, note] of Object.entries(state.notes)) {
    rows.push({ kind: 'note', id: date, data: { text: note.text }, updatedAt: note.updatedAt });
  }

  for (const [key, updatedAt] of Object.entries(state.sync.deleted)) {
    const { kind, id } = tombstoneRecordId(key);
    rows.push({ kind, id, data: null, updatedAt });
  }

  return rows;
}

/**
 * The inverse of `stateToRows`: a full `PlannerState` built from nothing but
 * a row set, with no existing state consulted. Used for the round-trip check
 * and for turning a first full pull into a starting state; ordinary
 * pull/realtime application goes through `merge.ts` instead, since those are
 * partial deltas being reconciled against what's already local.
 */
export function rowsToState(rows: Row[]): PlannerState {
  const subjects: Subject[] = [];
  const items: Item[] = [];
  const recurring: RecurringItem[] = [];
  const todos: TodoItem[] = [];
  const notes: PlannerState['notes'] = {};
  const deleted: Record<string, number> = {};
  const ticks: Record<string, number> = {};
  const doneDatesByRecurring = new Map<string, string[]>();

  for (const row of rows) {
    if (row.data === null) {
      deleted[`${row.kind}:${row.id}`] = row.updatedAt;
      continue;
    }
    switch (row.kind) {
      case 'subject': {
        const d = row.data as { name: string; hue: number | null };
        subjects.push({ id: row.id, name: d.name, hue: d.hue, updatedAt: row.updatedAt });
        break;
      }
      case 'item': {
        const d = row.data as Omit<Item, 'id' | 'updatedAt'>;
        items.push({ ...d, id: row.id, updatedAt: row.updatedAt });
        break;
      }
      case 'recurring': {
        const d = row.data as { subjectId: string | null; title: string; startDate: string; endDate: string };
        recurring.push({ ...d, id: row.id, doneDates: [], updatedAt: row.updatedAt });
        break;
      }
      case 'tick': {
        const d = row.data as { recurringId: string; date: string };
        ticks[row.id] = row.updatedAt;
        const dates = doneDatesByRecurring.get(d.recurringId) ?? [];
        dates.push(d.date);
        doneDatesByRecurring.set(d.recurringId, dates);
        break;
      }
      case 'todo': {
        const d = row.data as { text: string; done: boolean };
        todos.push({ id: row.id, text: d.text, done: d.done, updatedAt: row.updatedAt });
        break;
      }
      case 'note': {
        const d = row.data as { text: string };
        notes[row.id] = { text: d.text, updatedAt: row.updatedAt };
        break;
      }
    }
  }

  for (const r of recurring) {
    r.doneDates = doneDatesByRecurring.get(r.id) ?? [];
  }

  return { version: 1, subjects, items, recurring, todos, notes, sync: { deleted, ticks } };
}
