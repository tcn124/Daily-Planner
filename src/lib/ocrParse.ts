import type { ItemType, Subject } from '../types';
import { daysBetween, parseISO, toISO } from './dates';
import { uid } from '../store/defaults';
import { splitAssignment } from './categorize';
import type { OcrLine } from './ocr';

/**
 * Turns the lines Vision read out of a screenshot into candidate planner
 * items. Everything here is a guess — OCR gives text and boxes, not meaning —
 * so every result goes through a review table before it touches the store.
 *
 * Two layouts are recognised:
 *
 *  - A **list**: an assignment list, a syllabus table, Canvas's "Upcoming"
 *    sidebar. Each row carries its own date, or sits under a date heading.
 *  - A **calendar grid**: a month view. Day numbers mark the cells, and every
 *    other line belongs to the cell it sits in.
 *
 * Anything without a resolvable date is dropped rather than imported blind.
 */

export interface Candidate {
  /** Row key for the review table only; the store assigns its own ids. */
  id: string;
  /** The title, e.g. "Reading - Smith 1–20" once categorised. */
  description: string;
  /** The specifics the title was distilled from; empty when it said it all. */
  details: string;
  /** 'YYYY-MM-DD', or null when a date could not be resolved. */
  date: string | null;
  time: string;
  subjectId: string | null;
  type: ItemType;
  /** The OCR line(s) this came from, verbatim, so the user can see what was read. */
  source: string;
}

export interface ParseContext {
  /** 'YYYY-MM-DD' */
  today: string;
  /** 'YYYY-MM' — where the planner is currently looking; the fallback month for grids. */
  anchorMonth: string;
  subjects: Subject[];
  /**
   * Subject for rows that name none of their own — a syllabus is one course,
   * so the course in its title covers every row. See `headerSubject`.
   */
  fallbackSubjectId?: string | null;
}

/* ---- Dates ------------------------------------------------------------- */

const MONTH_NAMES =
  'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const WEEKDAY = '(?:(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?\\.?,?\\s+)?';
const ORDINAL = '(?:st|nd|rd|th)?';

/** "Sep 24", "Sept. 24th, 2026", "Thursday, September 24" */
const MONTH_DAY_RE = new RegExp(
  `\\b${WEEKDAY}(${MONTH_NAMES})\\.?\\s+(\\d{1,2})${ORDINAL}(?:,?\\s+(\\d{4}))?\\b`,
  'i',
);
/** "24 Sep", "24th September 2026" */
const DAY_MONTH_RE = new RegExp(
  `\\b${WEEKDAY}(\\d{1,2})${ORDINAL}\\s+(${MONTH_NAMES})\\.?(?:,?\\s+(\\d{4}))?\\b`,
  'i',
);
/** "9/24", "9/24/26", "09/24/2026" */
const NUMERIC_RE = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/;
/** "2026-09-24" */
const ISO_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/;
/** "September 2026" — a calendar's month heading. */
const MONTH_YEAR_RE = new RegExp(`\\b(${MONTH_NAMES})\\.?\\s+(\\d{4})\\b`, 'i');

function monthIndex(name: string): number {
  const key = name.slice(0, 3).toLowerCase();
  return ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(key) + 1;
}

/** 'YYYY-MM-DD' for a real calendar day, or null for Feb 30 and friends. */
function makeISO(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return toISO(parseISO(iso)) === iso ? iso : null;
}

/**
 * A date with no year is the one nearest to today: a January due date read
 * in September belongs to next year, not last.
 */
function nearestYear(month: number, day: number, today: string): string | null {
  const thisYear = parseISO(today).getFullYear();
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const year of [thisYear - 1, thisYear, thisYear + 1]) {
    const iso = makeISO(year, month, day);
    if (!iso) continue;
    const distance = Math.abs(daysBetween(today, iso));
    if (distance < bestDistance) {
      best = iso;
      bestDistance = distance;
    }
  }
  return best;
}

function fullYear(raw: string | undefined, month: number, day: number, today: string): string | null {
  if (!raw) return nearestYear(month, day, today);
  const n = Number(raw);
  return makeISO(raw.length === 2 ? 2000 + n : n, month, day);
}

interface DateMatch {
  iso: string;
  /** The text with the date removed. */
  rest: string;
}

/** Finds the first date in the text. Exported for the sanity script. */
export function resolveDate(text: string, today: string): DateMatch | null {
  let m = ISO_RE.exec(text);
  if (m) {
    const iso = makeISO(Number(m[1]), Number(m[2]), Number(m[3]));
    return iso ? { iso, rest: cut(text, m) } : null;
  }
  m = MONTH_DAY_RE.exec(text);
  if (m) {
    const iso = fullYear(m[3], monthIndex(m[1]), Number(m[2]), today);
    return iso ? { iso, rest: cut(text, m) } : null;
  }
  m = DAY_MONTH_RE.exec(text);
  if (m) {
    const iso = fullYear(m[3], monthIndex(m[2]), Number(m[1]), today);
    return iso ? { iso, rest: cut(text, m) } : null;
  }
  m = NUMERIC_RE.exec(text);
  if (m) {
    const iso = fullYear(m[3], Number(m[1]), Number(m[2]), today);
    return iso ? { iso, rest: cut(text, m) } : null;
  }
  return null;
}

/**
 * Removes a match, leaving a marker where it was so `cleanDescription` can
 * also drop the "at" / "by" / "due" that hung off it without touching the
 * same words elsewhere in a title ("Essay on Hamlet" keeps its "on").
 */
const MARK = '\u0000';
function cut(text: string, m: RegExpExecArray): string {
  return text.slice(0, m.index) + ` ${MARK} ` + text.slice(m.index + m[0].length);
}

/* ---- Times ------------------------------------------------------------- */

/**
 * "11:59pm", "2 PM", "2:30 p.m.", "14:00". The edges are explicit character
 * classes rather than `\b` so OCR noise like "_2:00pm" still yields the time
 * (an underscore counts as a word character and would defeat `\b`).
 */
const TIME_RE =
  /(?<![A-Za-z0-9:])(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?![A-Za-z0-9])|(?<![A-Za-z0-9:])([01]?\d|2[0-3]):([0-5]\d)(?![A-Za-z0-9:])/i;

interface TimeMatch {
  time: string;
  rest: string;
}

/** Pulls a clock time out of the text, formatted the way the composer would. */
export function extractTime(text: string): TimeMatch {
  const m = TIME_RE.exec(text);
  if (!m) return { time: '', rest: text };
  let time: string;
  if (m[3]) {
    const hour = Number(m[1]);
    // "0:00 pm" is never a real time; it comes from OCR noise like "_2:00pm".
    if (hour < 1 || hour > 12) return { time: '', rest: text };
    const suffix = m[3].toLowerCase().startsWith('a') ? 'am' : 'pm';
    time = `${hour}:${m[2] ?? '00'} ${suffix}`;
  } else {
    time = `${Number(m[4])}:${m[5]}`;
  }
  return { time, rest: cut(text, m) };
}

/* ---- Description ------------------------------------------------------- */

/** Words that only ever introduce a date or time, and are dead once it is gone. */
const BEFORE_MARK_RE = /\b(?:due|at|by|on|until|before|available until|closes?|opens?)\s*\u0000/gi;
const AFTER_MARK_RE = /\u0000\s*(?:at|by)\b/gi;
const FILLER_RE = /\b(?:due|available until|available|closes?|closed|opens?)\b|\b\d+(?:\.\d+)?\s*(?:pts?|points?)\b|[|•·]/gi;

/** Strips the words that surround a date in a Canvas row, leaving the title. */
export function cleanDescription(text: string): string {
  return text
    .replace(BEFORE_MARK_RE, ' ')
    .replace(AFTER_MARK_RE, ' ')
    .replace(/\u0000/g, ' ')
    .replace(FILLER_RE, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—:,._]+|[\s\-–—:,._]+$/g, '')
    .trim();
}

/* ---- Subjects and bands ------------------------------------------------ */

const COURSE_CODE_RE = /\b([a-z]{2,4})[ _-]?\d{3}[a-z]?\b/g;

/**
 * Matches a line against the subject list: the full name, then any word of
 * it, then a course-code prefix ("ECON 201" → Economics). First hit wins.
 */
export function guessSubject(text: string, subjects: Subject[]): string | null {
  const lower = text.toLowerCase();

  for (const s of subjects) {
    if (lower.includes(s.name.toLowerCase())) return s.id;
  }

  const tokensOf = (s: Subject) =>
    s.name.toLowerCase().split(/[^a-z]+/).filter((t) => t.length >= 4);
  const words = lower.split(/[^a-z]+/).filter((w) => w.length >= 4);

  for (const s of subjects) {
    for (const token of tokensOf(s)) {
      if (words.some((w) => token.startsWith(w) || w.startsWith(token))) return s.id;
    }
  }

  for (const m of lower.matchAll(COURSE_CODE_RE)) {
    const prefix = m[1];
    for (const s of subjects) {
      if (tokensOf(s).some((t) => t.startsWith(prefix))) return s.id;
    }
  }
  return null;
}

/**
 * The course a document is about, read from its top edge: "ECON 201 —
 * Introduction to Microeconomics" above a syllabus table. A calendar's
 * "September 2026" heading names no subject, so grids are unaffected.
 */
export function headerSubject(lines: OcrLine[], subjects: Subject[]): string | null {
  const header = lines
    .filter((l) => l.y < 0.15)
    .sort((a, b) => a.y - b.y)
    .map((l) => l.text)
    .join(' ');
  return header ? guessSubject(header, subjects) : null;
}

const EVENT_RE = /\b(lecture|class|section|lab|meeting|office hours|seminar|session|discussion|workshop|review session)\b/i;

export function guessType(description: string): ItemType {
  return EVENT_RE.test(description) ? 'event' : 'assignment';
}

/* ---- Layout: shared --------------------------------------------------- */

function cy(l: OcrLine): number {
  return l.y + l.h / 2;
}

function cx(l: OcrLine): number {
  return l.x + l.w / 2;
}

function median(ns: number[]): number {
  if (ns.length === 0) return 0;
  const s = [...ns].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * Groups lines that sit on the same baseline. `tolerance` is in image
 * fractions; lines whose centres are within it of the row's first line join
 * it. The first line is the fixed reference on purpose: measuring against a
 * running average lets one tall, two-line OCR box pull the next row in, and
 * from there every row drifts into the one above.
 */
function clusterRows(lines: OcrLine[], tolerance: number): OcrLine[][] {
  const sorted = [...lines].sort((a, b) => cy(a) - cy(b));
  const rows: OcrLine[][] = [];
  for (const line of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(cy(line) - cy(row[0])) < tolerance) row.push(line);
    else rows.push([line]);
  }
  return rows.map((r) => r.sort((a, b) => a.x - b.x));
}

function makeCandidate(
  text: string,
  date: string | null,
  time: string,
  source: string,
  ctx: ParseContext,
): Candidate | null {
  const line = cleanDescription(text);
  if (line.length < 3) return null;
  const type = guessType(line);
  // Assignments get a short kind-based title with the line as details;
  // events ("Lecture: Elasticity") already read as titles.
  const { title, details } = type === 'assignment' ? splitAssignment(line) : { title: line, details: '' };
  return {
    id: uid(),
    description: title,
    details,
    date,
    time,
    subjectId: guessSubject(source, ctx.subjects) ?? ctx.fallbackSubjectId ?? null,
    type,
    source,
  };
}

/* ---- Layout: list ------------------------------------------------------ */

function parseList(lines: OcrLine[], ctx: ParseContext): Candidate[] {
  const h = median(lines.map((l) => l.h));
  const rows = clusterRows(lines, h * 0.6);
  const out: Candidate[] = [];
  let carried: string | null = null;

  for (const row of rows) {
    const source = row.map((l) => l.text).join(' ');
    const found = resolveDate(source, ctx.today);
    const { time, rest } = extractTime(found ? found.rest : source);
    const body = cleanDescription(rest);

    if (found && body.length < 3) {
      // A date on its own is a heading: everything below it is due that day.
      carried = found.iso;
      continue;
    }
    if (!found && body.length === 0 && time) {
      // Canvas's sidebar puts the time on its own line under the title.
      const prev = out[out.length - 1];
      if (prev && !prev.time) prev.time = time;
      continue;
    }
    const date = found ? found.iso : carried;
    if (!date) continue;
    const candidate = makeCandidate(rest, date, time, source, ctx);
    if (candidate) out.push(candidate);
  }
  return out;
}

/* ---- Layout: calendar grid --------------------------------------------- */

const DAY_TOKEN_RE = /^\d{1,2}$/;

function isDayToken(l: OcrLine): boolean {
  if (!DAY_TOKEN_RE.test(l.text.trim())) return false;
  const n = Number(l.text);
  return n >= 1 && n <= 31;
}

interface DayCell {
  iso: string;
  /** Horizontal extent of the cell, in image fractions. */
  left: number;
  right: number;
}

interface GridRow {
  /** Top edge of the day numbers in this row. */
  y: number;
  cells: DayCell[];
}

interface Grid {
  rows: GridRow[];
}

/**
 * Finds the month grid, if there is one. Day numbers must line up in rows of
 * at least four; anything else is treated as a list.
 */
function detectGrid(lines: OcrLine[], ctx: ParseContext): Grid | null {
  let tokens = lines.filter(isDayToken);
  if (tokens.length < 6) return null;
  // A mini calendar in a sidebar has much smaller digits than the main grid.
  const h = median(tokens.map((t) => t.h));
  tokens = tokens.filter((t) => t.h >= h * 0.6);

  const rows = clusterRows(tokens, h * 1.5).filter((r) => r.length >= 4);
  if (rows.length === 0 || rows.flat().length < 6) return null;

  // Day numbers should read left to right; a list of numbers that doesn't
  // climb isn't a calendar.
  let climbs = 0;
  let steps = 0;
  for (const row of rows) {
    for (let i = 1; i < row.length; i++) {
      steps++;
      if (Number(row[i].text) > Number(row[i - 1].text)) climbs++;
    }
  }
  if (climbs < steps * 0.6) return null;

  // Month and year: from a heading if there is one, else where the planner is looking.
  let year: number;
  let month: number;
  const heading = lines.map((l) => MONTH_YEAR_RE.exec(l.text)).find(Boolean);
  if (heading) {
    year = Number(heading[2]);
    month = monthIndex(heading[1]);
  } else {
    year = Number(ctx.anchorMonth.slice(0, 4));
    month = Number(ctx.anchorMonth.slice(5, 7));
  }

  // Column pitch from the gaps between neighbouring numbers.
  const gaps: number[] = [];
  for (const row of rows) {
    for (let i = 1; i < row.length; i++) gaps.push(cx(row[i]) - cx(row[i - 1]));
  }
  const pitch = median(gaps);
  if (!(pitch > 0)) return null;

  // Whether the numbers sit at the left or right edge of their cell decides
  // where the cell boundaries fall. Try both and keep whichever splits the
  // other lines cleanly — the wrong choice leaves titles straddling edges.
  const content = lines.filter((l) => !isDayToken(l));
  const score = (inset: number) => {
    let contained = 0;
    for (const l of content) {
      for (const row of rows) {
        if (row.some((t) => l.x >= cx(t) - inset && l.x + l.w <= cx(t) - inset + pitch)) {
          contained++;
          break;
        }
      }
    }
    return contained;
  };
  const leftInset = pitch * 0.12;
  const rightInset = pitch * 0.88;
  const inset = score(rightInset) > score(leftInset) ? rightInset : leftInset;

  // Walk the numbers in reading order, rolling the month over whenever they
  // drop. Numbers before the first drop in the first row are the tail of the
  // previous month, which is how every month view pads its first week.
  const first = rows[0].map((t) => Number(t.text));
  const firstDrop = first.findIndex((n, i) => i > 0 && n < first[i - 1]);
  let y = year;
  let m = month;
  if (firstDrop > 0) {
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  let prev = 0;
  const grid: Grid = { rows: [] };
  for (const row of rows) {
    const gridRow: GridRow = { y: Math.min(...row.map((t) => t.y)), cells: [] };
    for (const t of row) {
      const n = Number(t.text);
      if (n < prev) {
        m += 1;
        if (m > 12) {
          m = 1;
          y += 1;
        }
      }
      prev = n;
      const iso = makeISO(y, m, n);
      if (!iso) continue;
      const left = cx(t) - inset;
      gridRow.cells.push({ iso, left, right: left + pitch });
    }
    grid.rows.push(gridRow);
  }
  return grid;
}

function parseGrid(lines: OcrLine[], grid: Grid, ctx: ParseContext): Candidate[] {
  const out: Candidate[] = [];
  for (const line of lines) {
    if (isDayToken(line)) continue;
    // The row is the nearest band of day numbers above the line.
    let row: GridRow | null = null;
    for (const r of grid.rows) {
      if (r.y <= cy(line)) row = r;
    }
    if (!row) continue;
    const x = cx(line);
    const cell = row.cells.find((c) => x >= c.left && x < c.right);
    if (!cell) continue;
    const { time, rest } = extractTime(line.text);
    const candidate = makeCandidate(rest, cell.iso, time, line.text, ctx);
    if (candidate) out.push(candidate);
  }
  return out;
}

/* ---- Entry ------------------------------------------------------------- */

export function parseOcr(lines: OcrLine[], ctx: ParseContext): Candidate[] {
  const usable = lines.filter((l) => l.text.trim().length > 0);
  if (usable.length === 0) return [];
  const grid = detectGrid(usable, ctx);
  return grid ? parseGrid(usable, grid, ctx) : parseList(usable, ctx);
}
