/**
 * Sanity checks for src/sync/mapping.ts and src/sync/merge.ts — no network,
 * no Supabase client, no test runner in this project. Run with:
 *
 *   npx tsx tools/sync/sync-check.ts
 */
import { rowsToState, stateToRows, type Row } from '../../src/sync/mapping.ts';
import { mergeRows } from '../../src/sync/merge.ts';
import type { PlannerState } from '../../src/types.ts';

let failures = 0;

/** Key order shouldn't matter — mapping.ts rebuilds objects field-by-field. */
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, stable(v)]),
    );
  }
  return value;
}

function eq<T>(label: string, got: T, want: T) {
  const gotStr = JSON.stringify(stable(got));
  const wantStr = JSON.stringify(stable(want));
  const ok = gotStr === wantStr;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n     got  ${gotStr}\n     want ${wantStr}`}`);
}

function state(overrides: Partial<PlannerState> = {}): PlannerState {
  return {
    version: 1,
    subjects: [],
    items: [],
    recurring: [],
    todos: [],
    notes: {},
    sync: { deleted: {}, ticks: {} },
    ...overrides,
  };
}

/* ---- round trip: state → rows → state ------------------------------- */

{
  const full = state({
    subjects: [{ id: 'econ', name: 'Economics', hue: 225, updatedAt: 10 }],
    items: [
      {
        id: 'i1', type: 'assignment', subjectId: 'econ', description: 'Read ch. 4',
        details: 'pp. 40-55', time: '11:59 pm', date: '2026-09-24', done: false,
        createdAt: 100, updatedAt: 200,
      },
    ],
    recurring: [
      {
        id: 'r1', subjectId: null, title: 'Practice', startDate: '2026-09-01',
        endDate: '2026-09-10', doneDates: ['2026-09-02', '2026-09-05'], updatedAt: 50,
      },
    ],
    todos: [{ id: 't1', text: 'Buy folders', done: true, updatedAt: 300 }],
    notes: { '2026-09-24': { text: 'Bring calculator', updatedAt: 400 } },
    sync: {
      deleted: { 'item:gone': 500, 'tick:r1:2026-09-09': 600 },
      ticks: { 'r1:2026-09-02': 20, 'r1:2026-09-05': 25 },
    },
  });

  const roundTripped = rowsToState(stateToRows(full));
  eq('round trip is lossless', roundTripped, full);
}

{
  // A doneDate restored via `recurring/add` (undo) with no `sync.ticks` entry
  // of its own must still round-trip — it falls back to the span's updatedAt.
  const withUntimedTick = state({
    recurring: [
      { id: 'r1', subjectId: null, title: 'Span', startDate: '2026-09-01', endDate: '2026-09-05', doneDates: ['2026-09-02'], updatedAt: 77 },
    ],
  });
  const rows = stateToRows(withUntimedTick);
  const tickRow = rows.find((r) => r.kind === 'tick');
  eq('untimed tick falls back to span updatedAt', tickRow?.updatedAt, 77);
  eq('untimed tick still round-trips into doneDates', rowsToState(rows).recurring[0].doneDates, ['2026-09-02']);
}

/* ---- merge: newer wins, ties keep local ------------------------------ */

{
  const local = state({
    items: [{ id: 'i1', type: 'assignment', subjectId: null, description: 'Old title', details: '', time: '', date: '2026-09-24', done: false, createdAt: 1, updatedAt: 100 }],
  });
  const newer: Row = { kind: 'item', id: 'i1', data: { type: 'assignment', subjectId: null, description: 'New title', details: '', time: '', date: '2026-09-24', done: false, createdAt: 1 }, updatedAt: 200 };
  const merged = mergeRows(local, [newer]);
  eq('newer remote update wins', merged.items[0].description, 'New title');
}

{
  const local = state({
    items: [{ id: 'i1', type: 'assignment', subjectId: null, description: 'Local title', details: '', time: '', date: '2026-09-24', done: false, createdAt: 1, updatedAt: 200 }],
  });
  const older: Row = { kind: 'item', id: 'i1', data: { type: 'assignment', subjectId: null, description: 'Stale title', details: '', time: '', date: '2026-09-24', done: false, createdAt: 1 }, updatedAt: 100 };
  const same: Row = { kind: 'item', id: 'i1', data: { type: 'assignment', subjectId: null, description: 'Tie title', details: '', time: '', date: '2026-09-24', done: false, createdAt: 1 }, updatedAt: 200 };
  eq('older remote update loses', mergeRows(local, [older]).items[0].description, 'Local title');
  eq('tie keeps local', mergeRows(local, [same]).items[0].description, 'Local title');
}

/* ---- merge: tombstones -------------------------------------------- */

{
  const local = state({
    items: [{ id: 'i1', type: 'assignment', subjectId: null, description: 'x', details: '', time: '', date: '2026-09-24', done: false, createdAt: 1, updatedAt: 100 }],
  });
  const remoteDelete: Row = { kind: 'item', id: 'i1', data: null, updatedAt: 200 };
  const merged = mergeRows(local, [remoteDelete]);
  eq('newer remote tombstone removes the local item', merged.items.length, 0);
  eq('newer remote tombstone is recorded', merged.sync.deleted['item:i1'], 200);
}

{
  const local = state({ sync: { deleted: { 'item:i1': 100 }, ticks: {} } });
  const restore: Row = {
    kind: 'item', id: 'i1',
    data: { type: 'assignment', subjectId: null, description: 'back', details: '', time: '', date: '2026-09-24', done: false, createdAt: 1 },
    updatedAt: 200,
  };
  const merged = mergeRows(local, [restore]);
  eq('a live row newer than a local tombstone restores the record', merged.items[0]?.description, 'back');
  eq('the stale tombstone is cleared', 'item:i1' in merged.sync.deleted, false);
}

{
  const local = state({ items: [{ id: 'i1', type: 'assignment', subjectId: null, description: 'kept', details: '', time: '', date: '2026-09-24', done: false, createdAt: 1, updatedAt: 500 }] });
  const staleDelete: Row = { kind: 'item', id: 'i1', data: null, updatedAt: 100 };
  eq('an older remote tombstone loses to a newer local edit', mergeRows(local, [staleDelete]).items.length, 1);
}

/* ---- merge: ticks are independent records -------------------------- */

{
  const local = state({
    recurring: [{ id: 'r1', subjectId: null, title: 'Span', startDate: '2026-09-01', endDate: '2026-09-10', doneDates: [], updatedAt: 10 }],
  });
  const tickMon: Row = { kind: 'tick', id: 'r1:2026-09-01', data: { recurringId: 'r1', date: '2026-09-01' }, updatedAt: 20 };
  const tickTue: Row = { kind: 'tick', id: 'r1:2026-09-02', data: { recurringId: 'r1', date: '2026-09-02' }, updatedAt: 21 };
  const merged = mergeRows(local, [tickMon, tickTue]);
  eq('two different ticks both survive', merged.recurring[0].doneDates.sort(), ['2026-09-01', '2026-09-02']);
}

{
  // A tick can arrive before the `recurring` row it belongs to in the same
  // batch — merge.ts must apply non-tick rows first regardless of input order.
  const local = state();
  const tick: Row = { kind: 'tick', id: 'r1:2026-09-01', data: { recurringId: 'r1', date: '2026-09-01' }, updatedAt: 20 };
  const span: Row = { kind: 'recurring', id: 'r1', data: { subjectId: null, title: 'Span', startDate: '2026-09-01', endDate: '2026-09-10' }, updatedAt: 10 };
  const merged = mergeRows(local, [tick, span]);
  eq('a tick ahead of its parent in the batch still attaches', merged.recurring[0]?.doneDates, ['2026-09-01']);
}

{
  const local = state({
    recurring: [{ id: 'r1', subjectId: null, title: 'Span', startDate: '2026-09-01', endDate: '2026-09-10', doneDates: ['2026-09-01'], updatedAt: 10 }],
    sync: { deleted: {}, ticks: { 'r1:2026-09-01': 20 } },
  });
  const untick: Row = { kind: 'tick', id: 'r1:2026-09-01', data: null, updatedAt: 30 };
  const merged = mergeRows(local, [untick]);
  eq('a newer tick tombstone unticks the day', merged.recurring[0].doneDates, []);
  eq('the tick tombstone is recorded', merged.sync.deleted['tick:r1:2026-09-01'], 30);
}

{
  // A recurring row updating only its own fields must not disturb doneDates
  // already known locally — ticks are pushed and merged separately.
  const local = state({
    recurring: [{ id: 'r1', subjectId: null, title: 'Old name', startDate: '2026-09-01', endDate: '2026-09-10', doneDates: ['2026-09-01'], updatedAt: 10 }],
  });
  const rename: Row = { kind: 'recurring', id: 'r1', data: { subjectId: null, title: 'New name', startDate: '2026-09-01', endDate: '2026-09-10' }, updatedAt: 20 };
  const merged = mergeRows(local, [rename]);
  eq('renaming a span keeps its local doneDates', merged.recurring[0].doneDates, ['2026-09-01']);
  eq('renaming a span applies the new title', merged.recurring[0].title, 'New name');
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
