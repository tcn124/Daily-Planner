import type { RecurringItem } from '../types';
import { buildWindow, daysBetween } from './dates';

/** Vertical pitch of one bar lane in the recurring band, in px. */
export const ROW_H = 44;
/** Gap above the first lane, and the bars' inset from their column edges. */
export const BAR_TOP = 10;
export const BAR_INSET = 6;

/** Every date the item covers, inclusive of both ends. */
export function spanDates(item: RecurringItem): string[] {
  return buildWindow(item.startDate, daysBetween(item.startDate, item.endDate) + 1);
}

/** Done only when every day in the span has been checked off. */
export function isFullyDone(item: RecurringItem): boolean {
  return spanDates(item).every((d) => item.doneDates.includes(d));
}

export interface RecurringProgress {
  /** 1-based position of `date` in the span ("day 4 of 5"); 0 when outside it. */
  dayIndex: number;
  total: number;
  /** Days in the span ticked so far — what the progress ticks draw. */
  doneCount: number;
  /** One flag per day of the span, in order: the tick track. */
  ticks: boolean[];
}

/**
 * Two different numbers the design shows for a span, kept apart on purpose:
 * where `date` falls in it ("Day 4/5", the list's Due column) and how much of
 * it is ticked off ("3 of 5 done", the bar's count and the tick track).
 */
export function recurringProgress(item: RecurringItem, date?: string): RecurringProgress {
  const days = spanDates(item);
  const done = new Set(item.doneDates);
  const ticks = days.map((d) => done.has(d));
  return {
    dayIndex: date ? days.indexOf(date) + 1 : 0,
    total: days.length,
    doneCount: ticks.filter(Boolean).length,
    ticks,
  };
}
