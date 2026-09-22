/**
 * Splits an imported assignment into a title and its details.
 *
 * What comes off a syllabus or Canvas is one line — "Read Smith, Wealth of
 * Nations pp. 1-20 before section". Cards want a short, scannable title with
 * the specifics underneath, so the line is sorted into a kind (Reading,
 * Problem Set, Essay, …) and reduced to `Kind - identifier`, while the full
 * line moves to the details so nothing is lost. Lines that fit no kind are
 * left as they are.
 */

export interface Split {
  title: string;
  details: string;
}

interface Kind {
  name: string;
  /** Marks the line as this kind. */
  re: RegExp;
  /** The kind's own words, removed when forming the identifier. */
  strip: RegExp;
}

/**
 * Checked in order: the specific before the general, so "Reading response 1"
 * is a Response and "Quiz on chapter 3" is a Quiz, not a Reading.
 */
const KINDS: Kind[] = [
  { name: 'Exam', re: /\b(?:exams?|midterms?|finals?)\b/i, strip: /\b(?:exams?)\b/gi },
  { name: 'Quiz', re: /\bquiz(?:zes)?\b/i, strip: /\bquiz(?:zes)?\b/gi },
  { name: 'Presentation', re: /\bpresentations?\b/i, strip: /\bpresentations?\b/gi },
  { name: 'Project', re: /\bprojects?\b/i, strip: /\bprojects?\b/gi },
  { name: 'Problem Set', re: /\bproblem\s*sets?\b|\bpsets?\b|\bp\.?s\.?\s*#?\s*\d/i, strip: /\bproblem\s*sets?\b|\bpsets?\b|\bp\.?s\.?(?=\s*#?\s*\d)/gi },
  { name: 'Homework', re: /\bhomework\b|\bhw\b/i, strip: /\bhomework\b|\bhw\b/gi },
  { name: 'Lab', re: /\blabs?\b/i, strip: /\blabs?\b/gi },
  { name: 'Essay', re: /\bessays?\b|\bpapers?\b/i, strip: /\bessays?\b|\bpapers?\b/gi },
  { name: 'Response', re: /\bresponse\b|\breflection\b|\bdiscussion\s*(?:post|board)\b|\bforum\s*post\b/i, strip: /\b(?:reading\s+)?response\b|\breflection\b|\bdiscussion\s*(?:post|board)\b|\bforum\s*post\b/gi },
  { name: 'Reading', re: /\bread(?:ings?)?\b|\bchapters?\b|\bch\.?\s*\d|\bpp?\.\s*\d|\bpages?\s+\d/i, strip: /\bread(?:ings?)?\b/gi },
];

/** "3", "#3", "3a" straight after a kind word: "Problem Set 3", "Quiz #2". */
const NUMBERED_RE =
  /\b(?:problem\s*sets?|psets?|p\.?s\.?|homework|hw|quiz(?:zes)?|essays?|papers?|labs?|projects?|exams?|tests?|assignments?|readings?|responses?|reflections?|presentations?)\s*#?\s*(\d+[a-z]?)\b/i;

/** "pp. 1-20", "p. 45", "pages 12–30", or a bare "1-20" after a name. */
const PAGES_RE = /\b(?:pp?\.?|pages?)\s*(\d+)(?:\s*[-–—]\s*(\d+))?\b|\b(\d{1,4})\s*[-–—]\s*(\d{1,4})\b/i;
/** "Chapter 3", "Ch. 4-5", "Chapters 2 and 3". */
const CHAPTER_RE = /\bch(?:apters?|\.)?\s*(\d+(?:\s*(?:[-–—]|and|&)\s*\d+)?)\b/i;

/** Words that only ever connect an identifier to its kind. */
const CONNECTOR_RE = /^(?:on|of|for|about|from|in|to|the|a|an|due|:|-|–|—|,|\.)\s+|\s+(?:on|of|for|about|from|in|to|the|a|an|due|:|-|–|—|,|\.)$/i;

const MAX_IDENTIFIER = 40;

function tidy(text: string): string {
  let t = text.replace(/\s+/g, ' ').replace(/^[\s\-–—:,.()]+|[\s\-–—:,.()]+$/g, '').trim();
  // Strip connectors from both ends until none are left.
  for (let prev = ''; prev !== t; ) {
    prev = t;
    t = t.replace(CONNECTOR_RE, '').replace(/^[\s\-–—:,.()]+|[\s\-–—:,.()]+$/g, '').trim();
  }
  return t;
}

/** Cuts at a word boundary so a long identifier never ends mid-word. */
function clip(text: string): string {
  if (text.length <= MAX_IDENTIFIER) return text;
  const cut = text.slice(0, MAX_IDENTIFIER + 1);
  const at = cut.lastIndexOf(' ');
  return (at > MAX_IDENTIFIER / 2 ? cut.slice(0, at) : cut.slice(0, MAX_IDENTIFIER)).trim() + '…';
}

export function splitAssignment(description: string): Split {
  const text = description.replace(/\s+/g, ' ').trim();
  const kind = KINDS.find((k) => k.re.test(text));
  if (!kind) return { title: text, details: '' };

  let title: string;
  const numbered = NUMBERED_RE.exec(text);
  if (kind.name === 'Reading') {
    // "Reading - Smith 1-20": the source, then the pages or chapter.
    const pages = PAGES_RE.exec(text);
    const chapter = CHAPTER_RE.exec(text);
    let where = '';
    if (chapter) where = `Ch. ${chapter[1].replace(/\s*(?:[-–—]|and|&)\s*/g, '–')}`;
    else if (pages) {
      const from = pages[1] ?? pages[3];
      const to = pages[2] ?? pages[4];
      where = to ? `${from}–${to}` : `p. ${from}`;
    }
    let name = text;
    if (chapter) name = name.replace(chapter[0], ' ');
    if (pages) name = name.replace(pages[0], ' ');
    name = clip(tidy(name.replace(kind.strip, ' ')));
    const identifier = [name, where].filter(Boolean).join(' ');
    title = identifier ? `Reading - ${identifier}` : 'Reading';
  } else if (numbered && kind.re.test(numbered[0])) {
    // "Problem Set 3", "Quiz 2" — the number is the whole identity.
    title = `${kind.name} ${numbered[1]}`;
  } else {
    const identifier = clip(tidy(text.replace(kind.strip, ' ')));
    title = identifier ? `${kind.name} - ${identifier}` : kind.name;
  }

  // The full line survives as details unless it says nothing the title doesn't.
  const details = title.toLowerCase() === text.toLowerCase() ? '' : text;
  return { title, details };
}
