import { subjectAccent } from '../../lib/color';
import { daysBetween } from '../../lib/dates';
import type { RecurringItem, Subject } from '../../types';
import { subjectOf } from './MobileRows';

interface Props {
  /** The days on screen, left to right. */
  window: string[];
  recurring: RecurringItem[];
  subjects: Subject[];
  onOpen: (id: string) => void;
}

/** Bar height and the pitch between lanes, from the canvas. */
const BAR_H = 34;
const PITCH = 40;
const TOP = 8;
/** Gap between a bar's end and the column edge, when the span really ends there. */
const INSET = 4;

/**
 * Recurring at two or three days: the desktop's spanning bars, shortened.
 *
 * A span that carries on past the edge of the window keeps a square end and
 * gains a ‹ or ›, so a bar you can see the end of is visibly different from
 * one that runs off screen. Each item gets its own lane, in span order — with
 * three columns there is no room to pack two bars onto one line and still
 * read them.
 */
export function MobileRecurringBars({ window: window_, recurring, subjects, onOpen }: Props) {
  const days = window_.length;
  const first = window_[0];
  const last = window_[days - 1];

  const visible = recurring
    .filter((r) => r.startDate <= last && r.endDate >= first)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title));

  if (visible.length === 0) {
    return <div className="m-bars m-bars--empty">Nothing recurring in these days</div>;
  }

  return (
    <div className="m-bars" style={{ height: TOP + visible.length * PITCH + INSET }}>
      {visible.map((r, lane) => {
        const from = Math.max(0, daysBetween(first, r.startDate));
        const to = Math.min(days - 1, daysBetween(first, r.endDate));
        const opensLeft = r.startDate < first;
        const opensRight = r.endDate > last;
        const leftInset = opensLeft ? 0 : INSET;
        const rightInset = opensRight ? 0 : INSET;
        const col = 100 / days;
        const accent = subjectAccent(subjectOf(subjects, r.subjectId)?.hue ?? null);

        return (
          <button
            key={r.id}
            type="button"
            className="m-bar"
            style={{
              top: TOP + lane * PITCH,
              left: `calc(${from * col}% + ${leftInset}px)`,
              width: `calc(${(to - from + 1) * col}% - ${leftInset + rightInset}px)`,
              height: BAR_H,
              borderLeftColor: accent,
              borderRadius: `${opensLeft ? 0 : 6}px ${opensRight ? 0 : 6}px ${
                opensRight ? 0 : 6
              }px ${opensLeft ? 0 : 6}px`,
            }}
            onClick={() => onOpen(r.id)}
          >
            {opensLeft && <span className="m-bar__edge">‹</span>}
            <span className="m-bar__dot" style={{ background: accent }} />
            <span className="m-bar__title">{r.title || 'Untitled'}</span>
            {opensRight && <span className="m-bar__edge">›</span>}
          </button>
        );
      })}
    </div>
  );
}
