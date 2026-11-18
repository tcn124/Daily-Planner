import { dayName } from '../../lib/dates';
import { recurringProgress } from '../../lib/recurring';
import type { Item, RecurringItem, Subject } from '../../types';
import { SubjectSquare } from '../SubjectSquare';

/**
 * The row and card shapes the phone uses, and the pieces they share.
 *
 * One day gets open rows with no boxes — title first, subject and time on one
 * line under it (frame 4a). Two and three days get soft grey cards with no
 * borders (4b, 4c). Neither carries a checkbox: done is a swipe right or the
 * item sheet, both of which leave an undo behind.
 */

export function subjectOf(subjects: Subject[], id: string | null): Subject | null {
  return subjects.find((s) => s.id === id) ?? null;
}

/**
 * A span's progress as short ticks, one per day: ink once ticked, faint until
 * then. The design's "Recurring shows a progress tick".
 */
export function TickTrack({ ticks, wide = false }: { ticks: boolean[]; wide?: boolean }) {
  return (
    <span className={wide ? 'm-ticks m-ticks--wide' : 'm-ticks'} aria-hidden="true">
      {ticks.map((on, i) => (
        <span key={i} className="m-ticks__seg" data-on={on} />
      ))}
    </span>
  );
}

/* --------------------------------------------------------------- 1 day */

interface RowProps {
  item: Item;
  subject: Subject | null;
  showDetails: boolean;
  onOpen: () => void;
}

/** The open row used when one day fills the screen, and in the List. */
export function MobileItemRow({ item, subject, showDetails, onOpen }: RowProps) {
  const meta = [subject?.name ?? 'No subject', item.done ? 'Done' : item.time]
    .filter(Boolean)
    .join(' · ');
  return (
    <button type="button" className="m-row" data-done={item.done} onClick={onOpen}>
      <span className="m-row__mark">
        <SubjectSquare hue={subject?.hue ?? null} dim={item.done} />
      </span>
      <span className="m-row__body">
        <span className="m-row__title">{item.description || 'Untitled'}</span>
        <span className="m-row__meta">{meta}</span>
        {showDetails && item.details && <span className="m-row__details">{item.details}</span>}
      </span>
    </button>
  );
}

/** "Mon – Fri" for a span. */
export function spanLabel(r: RecurringItem): string {
  return `${dayName(r.startDate).slice(0, 3)} – ${dayName(r.endDate).slice(0, 3)}`;
}

interface RecurringRowProps {
  item: RecurringItem;
  subject: Subject | null;
  /** The day being viewed — the one a swipe or the sheet ticks off. */
  date: string;
  /** "Day 4 of 5" on the Week; "Mon – Fri" in the List's Ongoing section. */
  meta: 'day' | 'span';
  onOpen: () => void;
}

/** Recurring as a row: title, where the day falls in the span, and its ticks. */
export function MobileRecurringRow({ item, subject, date, meta, onOpen }: RecurringRowProps) {
  const p = recurringProgress(item, date);
  const done = item.doneDates.includes(date);
  const where = meta === 'day' ? `Day ${p.dayIndex} of ${p.total}` : spanLabel(item);
  return (
    <button
      type="button"
      className="m-row m-row--recurring"
      data-done={meta === 'day' && done}
      onClick={onOpen}
    >
      <span className="m-row__mark">
        <SubjectSquare hue={subject?.hue ?? null} />
      </span>
      <span className="m-row__body">
        <span className="m-row__title">{item.title || 'Untitled'}</span>
        <span className="m-row__meta">
          {subject?.name ?? 'No subject'} · {where}
        </span>
      </span>
      <TickTrack ticks={p.ticks} />
    </button>
  );
}

/* ------------------------------------------------------------ 2–3 days */

/** A soft grey card, at least 64pt tall. `tight` is the three-day column. */
export function MobileItemCard({
  item,
  subject,
  showDetails,
  tight,
  onOpen,
}: RowProps & { tight: boolean }) {
  return (
    <button
      type="button"
      className={tight ? 'm-card m-card--tight' : 'm-card'}
      data-done={item.done}
      onClick={onOpen}
    >
      <span className="m-card__subject">
        <SubjectSquare hue={subject?.hue ?? null} size={7} dim={item.done} />
        <span className="m-card__subject-name">{subject?.name ?? 'No subject'}</span>
      </span>
      <span className="m-card__title">{item.description || 'Untitled'}</span>
      {showDetails && item.details && <span className="m-card__details">{item.details}</span>}
      {(item.time || item.done) && (
        <span className="m-card__meta">{item.done ? 'Done' : item.time}</span>
      )}
    </button>
  );
}
