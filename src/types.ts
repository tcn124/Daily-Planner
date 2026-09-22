export type ItemType = 'assignment' | 'event';
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
  description: string;
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

export interface Settings {
  daysVisible: DaysVisible;
  /** 'YYYY-MM-DD' — leftmost day of the visible window */
  anchorDate: string;
  view: ViewMode;
  /**
   * Relative heights of the Assignments / Events / Recurring bands. Weights
   * rather than pixels, so the grid still stretches to fill any window size.
   */
  bandWeights: [number, number, number];
  /**
   * Set only while the Today tab is selected: the day count to put back when it
   * is deselected. Its presence is what marks that tab active, so both the mode
   * and the count it borrowed survive a restart.
   */
  daysBeforeToday: DaysVisible | null;
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
  settings: Settings;
}
