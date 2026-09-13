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
import type {
  DaysVisible,
  Item,
  PlannerState,
  RecurringItem,
  Subject,
  ViewMode,
} from '../types';
import { addDays, startOfWeek, todayISO } from '../lib/dates';
import { createInitialState, uid } from './defaults';
import { loadState, saveState } from './persistence';

export type Action =
  | { type: 'item/add'; item: Omit<Item, 'id' | 'createdAt'> }
  | { type: 'item/update'; id: string; patch: Partial<Item> }
  | { type: 'item/delete'; id: string }
  | { type: 'item/toggle'; id: string }
  | { type: 'recurring/add'; item: Omit<RecurringItem, 'id'> }
  | { type: 'recurring/update'; id: string; patch: Partial<RecurringItem> }
  | { type: 'recurring/delete'; id: string }
  | { type: 'recurring/toggle'; id: string }
  | { type: 'todo/add'; text: string }
  | { type: 'todo/toggle'; id: string }
  | { type: 'todo/delete'; id: string }
  | { type: 'subject/add'; name: string; hue: number | null; id?: string }
  | { type: 'subject/update'; id: string; patch: Partial<Subject> }
  | { type: 'subject/delete'; id: string }
  | { type: 'settings/days'; days: DaysVisible }
  | { type: 'settings/anchor'; anchorDate: string }
  | { type: 'settings/shift'; direction: -1 | 1 }
  | { type: 'settings/today' }
  | { type: 'settings/bandWeights'; weights: [number, number, number] }
  | { type: 'settings/view'; view: ViewMode }
  | { type: 'state/replace'; state: PlannerState }
  | { type: 'state/reset' };

function reducer(state: PlannerState, action: Action): PlannerState {
  switch (action.type) {
    case 'item/add':
      return {
        ...state,
        items: [
          ...state.items,
          { ...action.item, id: uid(), createdAt: Date.now() },
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
        recurring: [...state.recurring, { ...action.item, id: uid() }],
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

    case 'recurring/toggle':
      return {
        ...state,
        recurring: state.recurring.map((r) =>
          r.id === action.id ? { ...r, done: !r.done } : r,
        ),
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

    case 'settings/days':
      return {
        ...state,
        settings: { ...state.settings, daysVisible: action.days },
      };

    case 'settings/anchor':
      return {
        ...state,
        settings: { ...state.settings, anchorDate: action.anchorDate },
      };

    case 'settings/shift':
      // One day per press, regardless of how many days are on screen.
      return {
        ...state,
        settings: {
          ...state.settings,
          anchorDate: addDays(state.settings.anchorDate, action.direction),
        },
      };

    case 'settings/today': {
      // A full week snaps to its Monday; shorter windows simply start on today
      // so the current day is always the first column.
      const today = todayISO();
      return {
        ...state,
        settings: {
          ...state.settings,
          anchorDate:
            state.settings.daysVisible === 7 ? startOfWeek(today) : today,
        },
      };
    }

    case 'settings/bandWeights':
      return {
        ...state,
        settings: { ...state.settings, bandWeights: action.weights },
      };

    case 'settings/view':
      return { ...state, settings: { ...state.settings, view: action.view } };

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
