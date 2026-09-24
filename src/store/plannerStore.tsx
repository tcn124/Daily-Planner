import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type Dispatch,
  type ReactNode,
} from 'react';
import type { Item, PlannerState, RecurringItem, Subject } from '../types';
import { createInitialState, uid } from './defaults';
import { loadState, saveState } from './persistence';
import { startSyncEngine, type SyncHandle } from '../sync/engine';

export type Action =
  /**
   * `id` and `createdAt` are generated here as a rule. They are accepted so an
   * undone delete can put an item back as it was rather than as a copy that
   * sorts to the end of its band — the same door `subject/add` already leaves
   * open for the screenshot importer. `updatedAt` is never accepted: an add is
   * always a fresh local write, including a restore, which must outrun the
   * tombstone it is undoing.
   */
  | {
      type: 'item/add';
      item: Omit<Item, 'id' | 'createdAt' | 'updatedAt'> &
        Partial<Pick<Item, 'id' | 'createdAt'>>;
    }
  | { type: 'item/update'; id: string; patch: Partial<Item> }
  | { type: 'item/delete'; id: string }
  | { type: 'item/toggle'; id: string }
  | { type: 'recurring/add'; item: Omit<RecurringItem, 'id' | 'updatedAt'> & { id?: string } }
  | { type: 'recurring/update'; id: string; patch: Partial<RecurringItem> }
  | { type: 'recurring/delete'; id: string }
  | { type: 'recurring/toggleDay'; id: string; date: string }
  | { type: 'todo/add'; text: string }
  | { type: 'todo/toggle'; id: string }
  | { type: 'todo/delete'; id: string }
  | { type: 'todo/clearDone' }
  | { type: 'subject/add'; name: string; hue: number | null; id?: string }
  | { type: 'subject/update'; id: string; patch: Partial<Subject> }
  | { type: 'subject/delete'; id: string }
  | { type: 'note/set'; date: string; text: string }
  | { type: 'state/replace'; state: PlannerState }
  /**
   * The result of `mergeRows` (`src/sync/merge.ts`), which has already done
   * its own per-record last-write-wins comparison against the state it was
   * given. A separate action from `state/replace` on purpose: replace is for
   * backup import, where the incoming state is meant to stomp everything —
   * merge's whole reason to exist is that it must never do that.
   */
  | { type: 'state/merge'; state: PlannerState }
  | { type: 'state/reset' };

type Sync = PlannerState['sync'];

/** A record was deleted: tombstone it so another device drops its own copy. */
function tombstone(sync: Sync, key: string): Sync {
  return { ...sync, deleted: { ...sync.deleted, [key]: Date.now() } };
}

/** A record with this key exists again — drop any stale tombstone for it. */
function untombstone(sync: Sync, key: string): Sync {
  if (!(key in sync.deleted)) return sync;
  const deleted = { ...sync.deleted };
  delete deleted[key];
  return { ...sync, deleted };
}

/** A day was ticked: it's a live per-tick record now, not a tombstone. */
function withTick(sync: Sync, key: string): Sync {
  const deleted = { ...sync.deleted };
  delete deleted[`tick:${key}`];
  return { deleted, ticks: { ...sync.ticks, [key]: Date.now() } };
}

/** A day was unticked: the tick record itself is now the thing that's gone. */
function withoutTick(sync: Sync, key: string): Sync {
  const ticks = { ...sync.ticks };
  delete ticks[key];
  return { ticks, deleted: { ...sync.deleted, [`tick:${key}`]: Date.now() } };
}

function reducer(state: PlannerState, action: Action): PlannerState {
  switch (action.type) {
    case 'item/add': {
      const id = action.item.id ?? uid();
      return {
        ...state,
        items: [
          ...state.items,
          {
            ...action.item,
            id,
            createdAt: action.item.createdAt ?? Date.now(),
            updatedAt: Date.now(),
          },
        ],
        sync: untombstone(state.sync, `item:${id}`),
      };
    }

    case 'item/update':
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === action.id ? { ...i, ...action.patch, updatedAt: Date.now() } : i,
        ),
      };

    case 'item/delete':
      return {
        ...state,
        items: state.items.filter((i) => i.id !== action.id),
        sync: tombstone(state.sync, `item:${action.id}`),
      };

    case 'note/set': {
      // Blank notes are dropped rather than stored, so `notes` stays sparse.
      const notes = { ...state.notes };
      const key = `note:${action.date}`;
      if (action.text.trim()) {
        notes[action.date] = { text: action.text, updatedAt: Date.now() };
        return { ...state, notes, sync: untombstone(state.sync, key) };
      }
      const hadNote = action.date in state.notes;
      delete notes[action.date];
      return { ...state, notes, sync: hadNote ? tombstone(state.sync, key) : state.sync };
    }

    case 'item/toggle':
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === action.id ? { ...i, done: !i.done, updatedAt: Date.now() } : i,
        ),
      };

    case 'recurring/add': {
      const id = action.item.id ?? uid();
      return {
        ...state,
        recurring: [...state.recurring, { ...action.item, id, updatedAt: Date.now() }],
        sync: untombstone(state.sync, `recurring:${id}`),
      };
    }

    case 'recurring/update':
      return {
        ...state,
        recurring: state.recurring.map((r) =>
          r.id === action.id ? { ...r, ...action.patch, updatedAt: Date.now() } : r,
        ),
      };

    case 'recurring/delete': {
      const target = state.recurring.find((r) => r.id === action.id);
      // Ticks are their own records; a deleted span tombstones them too,
      // rather than leaving them to linger in `sync.ticks` indefinitely.
      const syncAfterTicks = target
        ? target.doneDates.reduce(
            (sync, date) => withoutTick(sync, `${action.id}:${date}`),
            state.sync,
          )
        : state.sync;
      return {
        ...state,
        recurring: state.recurring.filter((r) => r.id !== action.id),
        sync: tombstone(syncAfterTicks, `recurring:${action.id}`),
      };
    }

    case 'recurring/toggleDay': {
      const target = state.recurring.find((r) => r.id === action.id);
      if (!target) return state;
      const key = `${action.id}:${action.date}`;
      const wasDone = target.doneDates.includes(action.date);
      return {
        ...state,
        recurring: state.recurring.map((r) =>
          r.id === action.id
            ? {
                ...r,
                doneDates: wasDone
                  ? r.doneDates.filter((d) => d !== action.date)
                  : [...r.doneDates, action.date],
              }
            : r,
        ),
        sync: wasDone ? withoutTick(state.sync, key) : withTick(state.sync, key),
      };
    }

    case 'todo/add': {
      const text = action.text.trim();
      if (!text) return state;
      return {
        ...state,
        todos: [...state.todos, { id: uid(), text, done: false, updatedAt: Date.now() }],
      };
    }

    case 'todo/toggle':
      return {
        ...state,
        todos: state.todos.map((t) =>
          t.id === action.id ? { ...t, done: !t.done, updatedAt: Date.now() } : t,
        ),
      };

    case 'todo/delete':
      return {
        ...state,
        todos: state.todos.filter((t) => t.id !== action.id),
        sync: tombstone(state.sync, `todo:${action.id}`),
      };

    case 'todo/clearDone': {
      // The phone's to-do band has no × on a pill, so this is how finished
      // notes leave the list.
      const now = Date.now();
      const deleted = { ...state.sync.deleted };
      for (const t of state.todos) if (t.done) deleted[`todo:${t.id}`] = now;
      return {
        ...state,
        todos: state.todos.filter((t) => !t.done),
        sync: { ...state.sync, deleted },
      };
    }

    case 'subject/add': {
      const name = action.name.trim();
      if (!name) return state;
      const id = action.id ?? uid();
      return {
        ...state,
        subjects: [...state.subjects, { id, name, hue: action.hue, updatedAt: Date.now() }],
        sync: untombstone(state.sync, `subject:${id}`),
      };
    }

    case 'subject/update':
      return {
        ...state,
        subjects: state.subjects.map((s) =>
          s.id === action.id ? { ...s, ...action.patch, updatedAt: Date.now() } : s,
        ),
      };

    case 'subject/delete': {
      // Items keep their content and fall back to the neutral surface rather
      // than being deleted along with the subject — but that reassignment is
      // itself an edit, so it gets its own timestamp too.
      const now = Date.now();
      return {
        ...state,
        subjects: state.subjects.filter((s) => s.id !== action.id),
        items: state.items.map((i) =>
          i.subjectId === action.id ? { ...i, subjectId: null, updatedAt: now } : i,
        ),
        recurring: state.recurring.map((r) =>
          r.subjectId === action.id ? { ...r, subjectId: null, updatedAt: now } : r,
        ),
        sync: tombstone(state.sync, `subject:${action.id}`),
      };
    }

    case 'state/replace':
      return action.state;

    case 'state/merge':
      return action.state;

    case 'state/reset':
      return createInitialState();

    default:
      return state;
  }
}

interface PlannerContextValue {
  state: PlannerState;
  dispatch: Dispatch<Action>;
}

const PlannerContext = createContext<PlannerContextValue | null>(null);

export function PlannerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);

  // Debounced write — typing in the composer shouldn't hit storage per keystroke.
  useEffect(() => {
    const handle = window.setTimeout(() => saveState(state), 200);
    return () => window.clearTimeout(handle);
  }, [state]);

  // A reload or tab close inside that debounce window would otherwise drop the
  // most recent change, so flush synchronously when the page goes away.
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    const flush = () => saveState(latest.current);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, []);

  // No-op when Supabase env vars are absent (see src/sync/client.ts) — every
  // checkout without Phase 0 done runs exactly as it does without this block.
  const sync = useRef<SyncHandle | null>(null);
  useEffect(() => {
    const handle = startSyncEngine(() => latest.current, dispatch);
    sync.current = handle;
    return () => {
      handle.stop();
      sync.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    sync.current?.notifyLocalChange(state);
  }, [state]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return (
    <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>
  );
}

export function usePlanner(): PlannerContextValue {
  const ctx = useContext(PlannerContext);
  if (!ctx) throw new Error('usePlanner must be used inside <PlannerProvider>');
  return ctx;
}
