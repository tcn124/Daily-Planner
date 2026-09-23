import type { Item } from '../types';

/**
 * "Missed" is derived, never stored: anything still open whose day has passed.
 * Shared by the sidebar, the phone's Week header, and the Planner tab so the
 * three can't drift apart.
 */
export function missedItems(items: Item[], today: string): Item[] {
  return items
    .filter((i) => !i.done && i.date < today)
    .sort((a, b) => a.date.localeCompare(b.date));
}
