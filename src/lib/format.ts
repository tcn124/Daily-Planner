import { daysBetween } from './dates';

/**
 * Counts are written the way the design's print references write them —
 * "/04", "/128" — so a count of four reads as a page number, not a badge.
 */
export function pad2(n: number): string {
  return `/${String(n).padStart(2, '0')}`;
}

/**
 * "11:59 pm" → "11:59p". The sidebar's right column is narrow and the design
 * writes times there in this clipped form. Free text that isn't a clock time
 * passes through untouched.
 */
export function compactTime(time: string): string {
  return time.replace(/\s*([ap])\.?m\.?$/i, (_, m: string) => m.toLowerCase());
}

/** "2d late" — the compact form for the desktop sidebar's right column. */
export function lateShort(date: string, today: string): string {
  return `${daysBetween(date, today)}d late`;
}

/** "2 days late" — the phone's spelled-out form. */
export function lateLong(date: string, today: string): string {
  const n = daysBetween(date, today);
  return `${n} day${n === 1 ? '' : 's'} late`;
}
