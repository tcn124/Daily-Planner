import { daysBetween } from '../../lib/dates';
import { recurringProgress } from '../../lib/recurring';
import type { RecurringItem, Subject } from '../../types';
import { SubjectSquare } from '../SubjectSquare';
import { subjectOf } from './MobileRows';

interface Props {
  /** The days on screen, left to right. */
  window: string[];
  recurring: RecurringItem[];
  subjects: Subject[];
  onOpen: (id: string) => void;
}

/** Bar height, the pitch between lanes and the first lane's offset (frames 4b, 4c). */
const BAR_H = 36;
const PITCH = 42;
const TOP = 6;
/** Inset at the window's outer edges, and at a column boundary inside it. */
const OUTER = 12;
const INNER = 6;

/**
 * Recurring at two or three days: grey bars spanning the columns they cover.
 * Each bar names where every visible day sits in its span — "4/5 · 5/5" — so a
 * bar that runs on past the window still says how far through it you are.
 * At three days the subject name gives way; its colour square carries it.
 */
export function MobileRecurringBars({ window: window_, recurring, subjects, onOpen }: Props) {
  const days = window_.length;
  const first = window_[0];
  const last = window_[days - 1];

  const visible = recurring
    .filter((r) => r.startDate <= last && r.endDate >= first)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title));

  if (visible.length === 0) {
    return <div className="m-empty-row">Nothing recurring in these days</div>;
  }

  return (
    <div className="m-bars" style={{ height: TOP + visible.length * PITCH + TOP }}>
      <div className="m-bars__grid" aria-hidden="true"
        style={{ gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))` }}>
        {window_.map((d) => <span key={d} />)}
      </div>
      {visible.map((r, lane) => {
        const from = Math.max(0, daysBetween(first, r.startDate));
        const to = Math.min(days - 1, daysBetween(first, r.endDate));
        const left = from === 0 ? OUTER : INNER;
        const right = to === days - 1 ? OUTER : INNER;
        const col = 100 / days;
        const subject = subjectOf(subjects, r.subjectId);
        const positions = window_
          .slice(from, to + 1)
          .map((d) => {
            const p = recurringProgress(r, d);
            return `${p.dayIndex}/${p.total}`;
          })
          .join(' · ');

        return (
          <button
            key={r.id}
            type="button"
            className="m-bar"
            style={{
              top: TOP + lane * PITCH,
              left: `calc(${from * col}% + ${left}px)`,
              width: `calc(${(to - from + 1) * col}% - ${left + right}px)`,
              height: BAR_H,
            }}
            onClick={() => onOpen(r.id)}
          >
            <span className="m-bar__line">
              <SubjectSquare hue={subject?.hue ?? null} size={7} />
              {days < 3 && <span className="m-bar__subject">{subject?.name ?? 'No subject'}</span>}
              <span className="m-bar__pos">{positions}</span>
            </span>
            <span className="m-bar__title">{r.title || 'Untitled'}</span>
          </button>
        );
      })}
    </div>
  );
}
