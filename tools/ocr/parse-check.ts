/**
 * Sanity checks for src/lib/ocrParse.ts. No test runner in this project, so:
 *
 *   npx tsx tools/ocr/parse-check.ts
 */
import {
  cleanDescription,
  extractTime,
  guessSubject,
  headerSubject,
  parseOcr,
  resolveDate,
} from '../../src/lib/ocrParse.ts';
import { SEED_SUBJECTS } from '../../src/store/defaults.ts';
import { splitAssignment } from '../../src/lib/categorize.ts';
import type { OcrLine } from '../../src/lib/ocr.ts';

let failures = 0;
function eq<T>(label: string, got: T, want: T) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const today = '2026-09-21';
const ctx = { today, anchorMonth: '2026-09', subjects: SEED_SUBJECTS };

// --- resolveDate: formats and year selection
eq('Sep 24', resolveDate('Due Sep 24 at 11:59pm', today)?.iso, '2026-09-24');
eq('Sept. 24th, 2025', resolveDate('Sept. 24th, 2025', today)?.iso, '2025-09-24');
eq('Thursday, September 24', resolveDate('Thursday, September 24', today)?.iso, '2026-09-24');
eq('24 Sep', resolveDate('24 Sep', today)?.iso, '2026-09-24');
eq('9/24', resolveDate('9/24', today)?.iso, '2026-09-24');
eq('9/24/26', resolveDate('9/24/26', today)?.iso, '2026-09-24');
eq('ISO', resolveDate('2026-09-24', today)?.iso, '2026-09-24');
eq('Jan 15 rolls to next year', resolveDate('Jan 15', today)?.iso, '2027-01-15');
eq('Aug 30 stays this year', resolveDate('Aug 30', today)?.iso, '2026-08-30');
eq('Feb 30 is not a date', resolveDate('Feb 30', today), null);
eq('no date', resolveDate('Week 3 readings', today), null);

// --- extractTime
eq('11:59pm', extractTime('Homework 11:59pm').time, '11:59 pm');
eq('2 PM', extractTime('Quiz 2 PM').time, '2:00 pm');
eq('14:00', extractTime('Lab 14:00').time, '14:00');
eq('no time from 9/24', extractTime('9/24 Essay').time, '');

// --- cleanDescription keeps title words
{
  const d = resolveDate('Essay on Hamlet due Sep 24 at 11:59pm | 100 pts', today)!;
  const t = extractTime(d.rest);
  eq('title keeps "on"', cleanDescription(t.rest), 'Essay on Hamlet');
}

// --- guessSubject
eq('full name', guessSubject('Economics problem set', SEED_SUBJECTS), 'economics');
eq('course code', guessSubject('ECON 201 PS3', SEED_SUBJECTS), 'economics');
eq('POLI_SCI code', guessSubject('POLI_SCI 201 reading response', SEED_SUBJECTS), 'political-science');
eq('word prefix', guessSubject('Hist reading', SEED_SUBJECTS), 'history');
eq('none', guessSubject('Buy groceries', SEED_SUBJECTS), null);

// --- list layout with a date heading and a time on its own line (Canvas sidebar)
const L = (text: string, y: number, x = 0.05, w = 0.3, h = 0.02): OcrLine => ({ text, x, y, w, h });
const list = parseOcr(
  [
    L('Sep 24', 0.10),
    L('Problem Set 3 - ECON 201', 0.14),
    L('11:59pm', 0.17),
    L('Reading response', 0.21),
    L('Sep 26', 0.26),
    L('Midterm review session', 0.30),
  ],
  ctx,
);
eq('list count', list.length, 3);
eq('list row 1', [list[0].date, list[0].description, list[0].details, list[0].time, list[0].subjectId], ['2026-09-24', 'Problem Set 3', 'Problem Set 3 - ECON 201', '11:59 pm', 'economics']);
eq('list row 2 inherits heading', [list[1].date, list[1].description], ['2026-09-24', 'Response']);
eq('list row 3 is an event', [list[2].date, list[2].type], ['2026-09-26', 'event']);

// --- calendar grid: 7 columns, day numbers top-left, leading days from August
function grid(numbersRight: boolean) {
  const lines: OcrLine[] = [L('September 2026', 0.02, 0.4, 0.2, 0.03)];
  const weeks = [
    [31, 1, 2, 3, 4, 5, 6],
    [7, 8, 9, 10, 11, 12, 13],
    [14, 15, 16, 17, 18, 19, 20],
    [21, 22, 23, 24, 25, 26, 27],
    [28, 29, 30, 1, 2, 3, 4],
  ];
  const W = 1 / 7;
  weeks.forEach((week, r) => {
    const top = 0.1 + r * 0.17;
    week.forEach((n, c) => {
      const x = numbersRight ? c * W + W - 0.03 : c * W + 0.01;
      lines.push(L(String(n), top, x, 0.02, 0.02));
    });
  });
  // Events: cell (row 3, col 3) = Sep 24; cell (row 0, col 0) = Aug 31; (row 4, col 4) = Oct 2
  lines.push(L('11:59pm Problem Set 3', 0.1 + 3 * 0.17 + 0.04, 3 * W + 0.01, W - 0.02, 0.018));
  lines.push(L('Syllabus quiz', 0.1 + 0 * 0.17 + 0.04, 0 * W + 0.01, W - 0.02, 0.018));
  lines.push(L('History lecture', 0.1 + 4 * 0.17 + 0.04, 4 * W + 0.01, W - 0.02, 0.018));
  return parseOcr(lines, ctx);
}
for (const right of [false, true]) {
  const g = grid(right);
  const byDesc = Object.fromEntries(g.map((c) => [c.description, c]));
  eq(`grid(${right ? 'right' : 'left'}) count`, g.length, 3);
  eq(`grid(${right ? 'right' : 'left'}) Sep 24`, [byDesc['Problem Set 3']?.date, byDesc['Problem Set 3']?.time], ['2026-09-24', '11:59 pm']);
  eq(`grid(${right ? 'right' : 'left'}) leading Aug 31`, [byDesc['Quiz - Syllabus']?.date, byDesc['Quiz - Syllabus']?.details], ['2026-08-31', 'Syllabus quiz']);
  eq(`grid(${right ? 'right' : 'left'}) trailing Oct 2`, [byDesc['History lecture']?.date, byDesc['History lecture']?.subjectId, byDesc['History lecture']?.type], ['2026-10-02', 'history', 'event']);
}

// --- real Vision output from a rasterised two-page syllabus PDF (Courier, so
// page 1 has one garbled two-line box; rows must still not bleed together)
import { readFileSync } from 'node:fs';
const pdfPages = JSON.parse(readFileSync(new URL('./fixtures/syllabus-pdf.json', import.meta.url), 'utf8')) as OcrLine[][];
const p1 = parseOcr(pdfPages[0], ctx);
const p2 = parseOcr(pdfPages[1], ctx);
const dated = (rows: typeof p1) => Object.fromEntries(rows.map((r) => [r.date, r.description]));
eq('pdf p1 dates are distinct rows', p1.map((r) => r.date), ['2026-09-22', '2026-09-24', '2026-09-29', '2026-10-01', '2026-10-03', '2026-10-06', '2026-10-08']);
eq('pdf p1 split-line title rejoined', dated(p1)['2026-10-08'], 'Lecture: Consumer choice');
eq('pdf p1 lecture is an event', p1.find((r) => r.date === '2026-09-29')?.type, 'event');
eq('pdf p2 rows', p2.map((r) => [r.date, r.description, r.details, r.time]), [
  ['2026-11-10', 'Exam - Midterm', 'Midterm exam', '2:00 pm'],
  ['2026-11-12', 'Problem Set 5', '', '11:59 pm'],
  ['2026-11-17', 'Presentation - Group project', 'Group project presentation', ''],
]);
eq('events keep their titles', p1.find((r) => r.date === '2026-09-29')?.description, 'Lecture: Elasticity');

// --- splitAssignment: kind-based titles with the specifics kept as details
const sp = (t: string) => { const r = splitAssignment(t); return [r.title, r.details]; };
eq('reading with author and pages', sp('Read Smith, Wealth of Nations pp. 1-20'), ['Reading - Smith, Wealth of Nations 1–20', 'Read Smith, Wealth of Nations pp. 1-20']);
eq('reading bare range', sp('Reading: Keynes 45-60'), ['Reading - Keynes 45–60', 'Reading: Keynes 45-60']);
eq('reading chapter', sp('Read chapter 3'), ['Reading - Ch. 3', 'Read chapter 3']);
eq('reading chapter span', sp('Chapters 4 and 5 of the textbook'), ['Reading - textbook Ch. 4–5', 'Chapters 4 and 5 of the textbook']);
eq('reading single page', sp('Read p. 12'), ['Reading - p. 12', 'Read p. 12']);
eq('numbered problem set', sp('Problem Set 3'), ['Problem Set 3', '']);
eq('numbered with course', sp('ECON 201 Problem Set 3'), ['Problem Set 3', 'ECON 201 Problem Set 3']);
eq('pset abbreviation', sp('PS4 due'), ['Problem Set 4', 'PS4 due']);
eq('homework', sp('HW 2'), ['Homework 2', 'HW 2']);
eq('essay topic', sp('Essay on Hamlet'), ['Essay - Hamlet', 'Essay on Hamlet']);
eq('quiz', sp('Quiz on chapter 3'), ['Quiz - chapter 3', 'Quiz on chapter 3']);
eq('exam', sp('Final exam'), ['Exam - Final', 'Final exam']);
eq('response numbered', sp('Reading response 1'), ['Response 1', 'Reading response 1']);
eq('discussion post', sp('Discussion post: markets'), ['Response - markets', 'Discussion post: markets']);
eq('no kind is untouched', sp('Journalism pitch'), ['Journalism pitch', '']);
eq('long identifier clipped at a word', sp('Essay on the causes and consequences of the industrial revolution in Britain')[0], 'Essay - causes and consequences of the…');
eq('pdf header names the course', headerSubject(pdfPages[0], SEED_SUBJECTS), 'economics');
eq('pdf p2 has no header subject', headerSubject(pdfPages[1], SEED_SUBJECTS), null);
eq('fallback fills rows without a guess', parseOcr(pdfPages[1], { ...ctx, fallbackSubjectId: 'economics' }).map((r) => r.subjectId), ['economics', 'economics', 'economics']);
eq('fallback does not override a row guess', parseOcr([L('Sep 24 HIST 200 essay', 0.5)], { ...ctx, fallbackSubjectId: 'economics' })[0].subjectId, 'history');
eq('grid heading gives no header subject', headerSubject([L('September 2026', 0.02), L('Mon', 0.08)], SEED_SUBJECTS), null);
eq('OCR underscore before a time', extractTime('exam _2:00pm').time, '2:00 pm');
eq('hour 0 is not a time', extractTime('exam 0:00 pm').time, '');

// --- nothing found
eq('no dates → empty', parseOcr([L('Welcome to the course', 0.1), L('Office hours TBD', 0.2)], ctx), []);

console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
process.exit(failures ? 1 : 0);
