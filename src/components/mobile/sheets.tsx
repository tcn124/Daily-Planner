import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ItemType } from '../../types';
import { ItemSheet } from './ItemSheet';
import { ComposerSheet } from './ComposerSheet';
import { PlannerSheet } from './PlannerSheet';

/**
 * Which sheet is open, and the undo toast — one place, above all three tabs.
 *
 * The sheets are reachable from everywhere: a row in the Week, a row in the
 * List, a missed item in the Planner. Holding them here rather than in each tab
 * means a sheet opened from the Week survives being opened over the List, and
 * that there is exactly one toast rather than three that could stack.
 */

/** Which band a new record goes in. Recurring is a different record, not a type. */
export type BandChoice = ItemType | 'recurring';

export interface ItemTarget {
  kind: 'item' | 'recurring';
  id: string;
  /** For a recurring span, the day whose tick this sheet's checkbox controls. */
  date: string;
}

export type ComposeTarget =
  | { mode: 'new'; date: string; band: BandChoice }
  | { mode: 'edit'; kind: 'item' | 'recurring'; id: string };

interface SheetsApi {
  openItem: (target: ItemTarget) => void;
  openCompose: (target: ComposeTarget) => void;
  openPlanner: () => void;
  /**
   * A line above the tab bar, with Undo when the action can be taken back.
   * Every destructive thing on the phone goes through here instead of a
   * confirmation — a swipe is too easy to make by accident to leave unrecorded,
   * and too quick to be worth a dialog.
   */
  toast: (message: string, undo?: () => void) => void;
}

const SheetsContext = createContext<SheetsApi | null>(null);

export function useSheets(): SheetsApi {
  const ctx = useContext(SheetsContext);
  if (!ctx) throw new Error('useSheets must be used inside <SheetHost>');
  return ctx;
}

/** How long an undo stays offered. */
const TOAST_MS = 6000;

interface Toast {
  /** Bumped on every toast so a replacement restarts the timer. */
  seq: number;
  message: string;
  undo?: () => void;
}

export function SheetHost({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<ItemTarget | null>(null);
  const [compose, setCompose] = useState<ComposeTarget | null>(null);
  const [planner, setPlanner] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    if (!toast) return;
    const handle = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(handle);
  }, [toast]);

  const api = useMemo<SheetsApi>(
    () => ({
      openItem: (target) => {
        setCompose(null);
        setItem(target);
      },
      // Editing replaces the item sheet rather than stacking on it: two sheets
      // deep is the nested navigation the design does without.
      openCompose: (target) => {
        setItem(null);
        setCompose(target);
      },
      openPlanner: () => setPlanner(true),
      toast: (message, undo) => setToast((t) => ({ seq: (t?.seq ?? 0) + 1, message, undo })),
    }),
    [],
  );

  return (
    <SheetsContext.Provider value={api}>
      {children}

      {item && (
        <ItemSheet
          target={item}
          onClose={() => setItem(null)}
          onEdit={(t) => api.openCompose(t)}
        />
      )}
      {compose && <ComposerSheet target={compose} onClose={() => setCompose(null)} />}
      {planner && <PlannerSheet onClose={() => setPlanner(false)} />}

      {toast && (
        <div className="m-toast" role="status">
          <span className="m-toast__text">{toast.message}</span>
          {toast.undo && (
            <button
              type="button"
              className="m-toast__undo"
              onClick={() => {
                toast.undo?.();
                setToast(null);
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </SheetsContext.Provider>
  );
}
