/**
 * Turns a bare run of digits into a clock time the way people type it:
 *
 *   2    → 2:00       11   → 11:00
 *   431  → 4:31       100  → 1:00
 *   1200 → 12:00      930  → 9:30
 *
 * One or two digits are an hour; three are H:MM; four are HH:MM. A trailing
 * am/pm (with or without the "m") is kept and normalised. Anything else —
 * already formatted, or carrying extra text like "2:30 pm · Kresge" — is
 * returned untouched, since the field is deliberately free text.
 */
export function formatTimeInput(raw: string): string {
  const m = /^\s*(\d{1,4})\s*(?:(a|p)m?)?\s*$/i.exec(raw);
  if (!m) return raw;

  const digits = m[1];
  const suffix = m[2] ? ` ${m[2].toLowerCase()}m` : '';

  let hour: string;
  let minute: string;
  if (digits.length <= 2) {
    hour = String(Number(digits));
    minute = '00';
  } else {
    hour = String(Number(digits.slice(0, -2)));
    minute = digits.slice(-2);
  }

  // Don't invent a time out of something that isn't one.
  if (Number(minute) > 59) return raw;

  return `${hour}:${minute}${suffix}`;
}
