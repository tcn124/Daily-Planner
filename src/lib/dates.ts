const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * All dates in this app are handled as 'YYYY-MM-DD' strings and converted to
 * local-noon Date objects. Noon avoids every DST edge case — adding days can
 * never roll the calendar date backwards or forwards by accident.
 */
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function toISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayISO(): string {
  return toISO(new Date());
}

export function addDays(iso: string, delta: number): string {
  const date = parseISO(iso);
  date.setDate(date.getDate() + delta);
  return toISO(date);
}

/** Difference in whole days, b - a. */
export function daysBetween(a: string, b: string): number {
  const ms = parseISO(b).getTime() - parseISO(a).getTime();
  return Math.round(ms / 86_400_000);
}

/** The Monday on or before the given date — the design starts weeks on Monday. */
export function startOfWeek(iso: string): string {
  const weekday = parseISO(iso).getDay(); // 0 = Sunday
  return addDays(iso, -((weekday + 6) % 7));
}

/** N consecutive ISO dates starting at `anchor`. */
export function buildWindow(anchor: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => addDays(anchor, i));
}

export function dayName(iso: string): string {
  return DAY_NAMES[parseISO(iso).getDay()];
}

/** Day of month, zero-padded — "08". */
export function dayNumber(iso: string): string {
  return String(parseISO(iso).getDate()).padStart(2, '0');
}

export function monthShort(iso: string): string {
  return MONTH_NAMES[parseISO(iso).getMonth()];
}

/**
 * "Aug 08 - 14", or "Aug 30 - Sep 05" when the window straddles two months.
 */
export function formatRange(window: string[]): string {
  if (window.length === 0) return '';
  const first = window[0];
  const last = window[window.length - 1];
  const start = `${monthShort(first)} ${dayNumber(first)}`;
  const end =
    monthShort(first) === monthShort(last)
      ? dayNumber(last)
      : `${monthShort(last)} ${dayNumber(last)}`;
  return `${start} - ${end}`;
}

/** Inclusive overlap test between a date and a [start, end] span. */
export function isWithin(iso: string, start: string, end: string): boolean {
  return iso >= start && iso <= end;
}

/**
 * "Aug 24 – 30", or "Aug 30 – Sep 5" when the window straddles two months.
 * Unpadded with an en dash, matching the header and list-view headings.
 */
export function formatSpan(window: string[]): string {
  if (window.length === 0) return '';
  const first = window[0];
  const last = window[window.length - 1];
  if (first === last) return `${monthShort(first)} ${dayOfMonth(first)}`;
  const end =
    monthShort(first) === monthShort(last)
      ? dayOfMonth(last)
      : `${monthShort(last)} ${dayOfMonth(last)}`;
  return `${monthShort(first)} ${dayOfMonth(first)} – ${end}`;
}

/**
 * ISO-8601 week number. Weeks start Monday and week 1 is the one containing
 * the first Thursday of the year.
 */
export function isoWeek(iso: string): number {
  const date = parseISO(iso);
  // Shift to the Thursday of this week, then count weeks from Jan 1.
  const thursday = new Date(date);
  thursday.setDate(date.getDate() - ((date.getDay() + 6) % 7) + 3);
  const firstThursday = new Date(thursday.getFullYear(), 0, 4, 12);
  firstThursday.setDate(
    firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3,
  );
  return (
    1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86_400_000))
  );
}

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function monthLong(iso: string): string {
  return MONTHS_LONG[parseISO(iso).getMonth()];
}

export function year(iso: string): string {
  return String(parseISO(iso).getFullYear());
}

/** Plain day-of-month with no padding, for the header corner numbers. */
export function dayOfMonth(iso: string): string {
  return String(parseISO(iso).getDate());
}
