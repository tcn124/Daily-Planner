import type { Item, RecurringItem, Subject } from '../types';
import { isWithin } from './dates';
import { spanDates } from './recurring';

/**
 * Flattening items and recurring spans into one row per day.
 *
 * Both list views need the same thing — a recurring span appears once on every
 * day it covers, an item appears on its own day — and they need it to stay the
 * same as the data model grows. Shared so a new field can't reach one list and
 * not the other.
 */

export type RowKind = 'assignment' | 'event' | 'recurring';

export interface ListRow {
  kind: RowKind;
  id: string;
  date: string;
  hue: number | null;
  subject: string;
  subjectId: string | null;
  desc: string;
  /** Empty for recurring items, which have no details field. */
  details: string;
  time: string;
  done: boolean;
  createdAt: number;
}

/**
 * Every day with anything on it, earliest first. There is no window: days with
 * nothing scheduled are simply absent rather than padded in.
 */
export function activeDates(items: Item[], recurring: RecurringItem[]): string[] {
  return [
    ...new Set([...items.map((i) => i.date), ...recurring.flatMap(spanDates)]),
  ].sort();
}

export function rowsForDate(
  date: string,
  items: Item[],
  recurring: RecurringItem[],
  subjects: Subject[],
): ListRow[] {
  const lookup = (id: string | null) => subjects.find((s) => s.id === id) ?? null;

  const dayItems = items
    .filter((i) => i.date === date)
    .map<ListRow>((i) => {
      const s = lookup(i.subjectId);
      return {
        kind: i.type,
        id: i.id,
        date,
        hue: s?.hue ?? null,
        subject: s?.name ?? 'No subject',
        subjectId: i.subjectId,
        desc: i.description || 'Untitled',
        details: i.details,
        time: i.time,
        done: i.done,
        createdAt: i.createdAt,
      };
    });

  const dayRecurring = recurring
    .filter((r) => isWithin(date, r.startDate, r.endDate))
    .map<ListRow>((r) => {
      const s = lookup(r.subjectId);
      return {
        kind: 'recurring',
        id: r.id,
        date,
        hue: s?.hue ?? null,
        subject: s?.name ?? 'No subject',
        subjectId: r.subjectId,
        desc: r.title || 'Untitled',
        details: '',
        time: '',
        // Recurring is ticked off per day, so "done" is about this day only.
        done: r.doneDates.includes(date),
        createdAt: 0,
      };
    });

  return [...dayItems, ...dayRecurring];
}
