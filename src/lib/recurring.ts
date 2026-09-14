import type { RecurringItem } from '../types';
import { buildWindow, daysBetween } from './dates';

/** Vertical pitch of one bar lane in the recurring band, in px. */
export const ROW_H = 44;

/** Every date the item covers, inclusive of both ends. */
export function spanDates(item: RecurringItem): string[] {
  return buildWindow(item.startDate, daysBetween(item.startDate, item.endDate) + 1);
}

/** Done only when every day in the span has been checked off. */
export function isFullyDone(item: RecurringItem): boolean {
  return spanDates(item).every((d) => item.doneDates.includes(d));
}
