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

export type Action =
  /**
   * `id` and `createdAt` are generated here as a rule. They are accepted so an
   * undone delete can put an item back as it was rather than as a copy that
   * sorts to the end of its band — the same door `subject/add` already leaves
   * open for the screenshot importer.
   */
  | {
      type: 'item/add';
      item: Omit<Item, 'id' | 'createdAt'> & Partial<Pick<Item, 'id' | 'createdAt'>>;
    }
  | { type: 'item/update'; id: string; patch: Partial<Item> }
  | { type: 'item/delete'; id: string }
  | { type: 'item/toggle'; id: string }
  | { type: 'recurring/add'; item: Omit<RecurringItem, 'id'> & { id?: string } }
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
  | { type: 'state/reset' };

function reducer(state: PlannerState, action: Action): PlannerState {
  switch (action.type) {
    case 'item/add':
      return {
        ...state,
        items: [
          ...state.items,
          {
            ...action.item,
            id: action.item.id ?? uid(),
            createdAt: action.item.createdAt ?? Date.now(),
          },
        ],
      };

    case 'item/update':
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === action.id ? { ...i, ...action.patch } : i,
        ),
      };

    case 'item/delete':
      return { ...state, items: state.items.filter((i) => i.id !== action.id) };

    case 'note/set': {
      // Blank notes are dropped rather than stored, so `notes` stays sparse.
      const notes = { ...state.notes };
      if (action.text.trim()) notes[action.date] = action.text;
      else delete notes[action.date];
      return { ...state, notes };
    }

    case 'item/toggle':
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === action.id ? { ...i, done: !i.done } : i,
        ),
      };

    case 'recurring/add':
      return {
        ...state,
        recurring: [
          ...state.recurring,
          { ...action.item, id: action.item.id ?? uid() },
        ],
      };

    case 'recurring/update':
      return {
        ...state,
        recurring: state.recurring.map((r) =>
          r.id === action.id ? { ...r, ...action.patch } : r,
        ),
      };

    case 'recurring/delete':
      return {
        ...state,
        recurring: state.recurring.filter((r) => r.id !== action.id),
      };

    case 'recurring/toggleDay':
      return {
        ...state,
        recurring: state.recurring.map((r) => {
          if (r.id !== action.id) return r;
          const done = r.doneDates.includes(action.date);
          return {
            ...r,
            doneDates: done
              ? r.doneDates.filter((d) => d !== action.date)
              : [...r.doneDates, action.date],
          };
        }),
      };

    case 'todo/add': {
      const text = action.text.trim();
      if (!text) return state;
      return {
        ...state,
        todos: [...state.todos, { id: uid(), text, done: false }],
      };
    }

    case 'todo/toggle':
      return {
        ...state,
        todos: state.todos.map((t) =>
          t.id === action.id ? { ...t, done: !t.done } : t,
        ),
      };

    case 'todo/delete':
      return { ...state, todos: state.todos.filter((t) => t.id !== action.id) };

    case 'todo/clearDone':
      // The phone's to-do band has no × on a pill, so this is how finished
      // notes leave the list.
      return { ...state, todos: state.todos.filter((t) => !t.done) };

    case 'subject/add': {
      const name = action.name.trim();
      if (!name) return state;
      return {
        ...state,
        subjects: [
          ...state.subjects,
          { id: action.id ?? uid(), name, hue: action.hue },
        ],
      };
    }

    case 'subject/update':
      return {
        ...state,
        subjects: state.subjects.map((s) =>
          s.id === action.id ? { ...s, ...action.patch } : s,
        ),
      };

    case 'subject/delete':
      // Items keep their content and fall back to the neutral surface rather
      // than being deleted along with the subject.
      return {
        ...state,
        subjects: state.subjects.filter((s) => s.id !== action.id),
        items: state.items.map((i) =>
          i.subjectId === action.id ? { ...i, subjectId: null } : i,
        ),
        recurring: state.recurring.map((r) =>
          r.subjectId === action.id ? { ...r, subjectId: null } : r,
        ),
      };

    case 'state/replace':
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
