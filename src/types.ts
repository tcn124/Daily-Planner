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
   * every day in the span is here.
   */
  doneDates: string[];
}

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
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
  notes: Record<string, string>;
}
