export type ItemType = 'assignment' | 'event';
/**
 * Which desktop view is showing, and how many day columns it has. Both live
 * in `devicePrefs`, not here: they describe a screen, not a planner.
 */
export type ViewMode = 'grid' | 'list';
/** How many day columns the week view shows. Any whole number from 1 to 14. */
export type DaysVisible = number;

export interface Subject {
  id: string;
  name: string;
  /** 0–359, or null for the neutral grey surface. All shades derive from this. */
  hue: number | null;
  /** Server-clock ms; last-write-wins comparator once sync exists. */
  updatedAt: number;
}

export interface Item {
  id: string;
  type: ItemType;
  subjectId: string | null;
  /** The title — what the card shows in full. */
  description: string;
  /**
   * The specifics under the title: page ranges, the prompt, where to submit.
   * Shown small and clamped on the card. Empty string when unset.
   */
  details: string;
  /** Free text as typed, e.g. "1:15pm". Empty string when unset. */
  time: string;
  /** 'YYYY-MM-DD' */
  date: string;
  done: boolean;
  createdAt: number;
  /** Server-clock ms; last-write-wins comparator once sync exists. */
  updatedAt: number;
}

export interface RecurringItem {
  id: string;
  subjectId: string | null;
  title: string;
  /** 'YYYY-MM-DD', inclusive */
  startDate: string;
  /** 'YYYY-MM-DD', inclusive */
  endDate: string;
  /**
   * The days within the span that have been checked off, as 'YYYY-MM-DD'.
   * Each day is completed on its own; the whole item counts as done only when
   * every day in the span is here. Per-day sync state (needed so two devices
   * ticking different days never collide) lives in `PlannerState.sync.ticks`,
   * not here — this array stays the local render shape.
   */
  doneDates: string[];
  /** Server-clock ms; covers the span's own fields, not `doneDates`. */
  updatedAt: number;
}

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  /** Server-clock ms; last-write-wins comparator once sync exists. */
  updatedAt: number;
}

export interface PlannerState {
  version: 1;
  subjects: Subject[];
  items: Item[];
  recurring: RecurringItem[];
  todos: TodoItem[];
  /**
   * Free-text note per day, keyed by 'YYYY-MM-DD'. Days without a note are
   * simply absent rather than stored empty.
   */
  notes: Record<string, { text: string; updatedAt: number }>;
  /**
   * Sync bookkeeping. Never rendered, and stripped from backups the way
   * `settings` is by `stripSettings` — a device's tombstones are its own, not
   * something a restored backup should carry.
   */
  sync: {
    /**
     * `${kind}:${id}` → when it was deleted, e.g. `item:abc123`. `kind` is one
     * of `subject | item | recurring | todo | note | tick` (matching the
     * server table's check constraint); a tick's id is itself
     * `${recurringId}:${date}`, so its tombstone key is
     * `tick:${recurringId}:${date}`. Purged after 30 days on load.
     */
    deleted: Record<string, number>;
    /**
     * `${recurringId}:${date}` → when that day was last checked off. Only
     * currently-ticked days are here; unticking removes the entry and adds a
     * `tick:` tombstone to `deleted` instead — presence here is what makes a
     * tick its own last-write-wins record instead of losing to whichever
     * device last touched the parent span.
     */
    ticks: Record<string, number>;
  };
}
