import { subjectChipBg, subjectChipInk, subjectAccent } from '../../lib/color';
import { buildWindow, daysBetween, isWithin, startOfWeek } from '../../lib/dates';
import { spanDates } from '../../lib/recurring';
import type { Item, RecurringItem, Subject } from '../../types';

/**
 * The row and card shapes the phone uses, and the pieces they share.
 *
 * One day gets flat rows; two and three days get the desktop card at phone
 * sizes. That is deliberate rather than responsive: at three days a column is
 * about 120pt, close enough to the desktop's own column that its card is the
 * right component, while at one day a full-width card would be a box drawn
 * around the whole screen.
 */

export function subjectOf(subjects: Subject[], id: string | null): Subject | null {
  return subjects.find((s) => s.id === id) ?? null;
}

interface ChipProps {
  subject: Subject | null;
  /** A finished item drops to the neutral chip, as on the desktop. */
  done: boolean;
}

export function MobileChip({ subject, done }: ChipProps) {
  const hue = done ? null : subject?.hue ?? null;
  return (
    <span
      className="m-chip"
      style={{ background: subjectChipBg(hue), color: subjectChipInk(hue) }}
    >
      {subject?.name ?? 'No subject'}
    </span>
  );
}

export function MobileCheckbox({
  done,
  label,
  onToggle,
  small = false,
}: {
  done: boolean;
  label: string;
  onToggle: () => void;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      className={small ? 'm-check m-check--sm' : 'm-check'}
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      data-checked={done}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      {done ? '✓' : ''}
    </button>
  );
}

/* --------------------------------------------------------------- 1 day */

interface RowProps {
  item: Item;
  subject: Subject | null;
  showDetails: boolean;
  onToggle: () => void;
  onOpen: () => void;
}

/** The flat row used when one day fills the screen. */
export function MobileItemRow({ item, subject, showDetails, onToggle, onOpen }: RowProps) {
  const meta = item.done ? 'Done' : item.time;
  return (
    <div className="m-row" data-done={item.done}>
      <button type="button" className="m-row__body" onClick={onOpen}>
        <span className="m-row__title">{item.description || 'Untitled'}</span>
        {showDetails && item.details && <span className="m-row__details">{item.details}</span>}
        <span className="m-row__meta">
          <MobileChip subject={subject} done={item.done} />
          {meta && <span className="m-row__time">{meta}</span>}
        </span>
      </button>
      <div className="m-row__check">
        <MobileCheckbox
          done={item.done}
          label={item.done ? 'Mark as not done' : 'Mark as done'}
          onToggle={onToggle}
        />
      </div>
    </div>
  );
}

/** How a recurring item's span reads in the meta line: "Mon – Fri · day 2 of 5". */
export function recurringMeta(r: RecurringItem, date: string): string {
  const span = spanDates(r);
  const position = daysBetween(r.startDate, date) + 1;
  const first = new Date(`${r.startDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' });
  const last = new Date(`${r.endDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' });
  return `${first} – ${last} · day ${position} of ${span.length}`;
}

interface RecurringRowProps {
  item: RecurringItem;
  subject: Subject | null;
  /** The day being viewed — the one the checkbox ticks off. */
  date: string;
  onToggleDay: () => void;
  onOpen: () => void;
}

/**
 * Recurring at one day. The desktop's spanning bar has nowhere to span, so the
 * week it covers is drawn as a seven-segment track underneath instead: the day
 * you are looking at stands taller, the rest of the span sits back at 35%.
 */
export function MobileRecurringRow({ item, subject, date, onToggleDay, onOpen }: RecurringRowProps) {
  const week = buildWindow(startOfWeek(date), 7);
  const accent = subjectAccent(subject?.hue ?? null);
  const done = item.doneDates.includes(date);

  return (
    <div className="m-row m-row--recurring" data-done={done} style={{ boxShadow: `inset 3px 0 0 ${accent}` }}>
      <button type="button" className="m-row__body" onClick={onOpen}>
        <span className="m-row__title">{item.title || 'Untitled'}</span>
        <span className="m-row__meta">
          <MobileChip subject={subject} done={done} />
          <span className="m-row__time">{recurringMeta(item, date)}</span>
        </span>
        <span className="m-track" aria-hidden="true">
          {week.map((d) => {
            const inSpan = isWithin(d, item.startDate, item.endDate);
            const current = d === date;
            return (
              <span
                key={d}
                className="m-track__seg"
                style={{
                  height: current ? 6 : 4,
                  background: inSpan ? accent : 'rgba(55, 53, 47, 0.08)',
                  opacity: inSpan && !current ? 0.35 : 1,
                }}
              />
            );
          })}
        </span>
      </button>
      <div className="m-row__check">
        <MobileCheckbox
          done={done}
          label={done ? 'Mark this day as not done' : 'Mark this day as done'}
          onToggle={onToggleDay}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ 2–3 days */

/** The desktop card at phone size. `tight` is the three-day column. */
export function MobileItemCard({
  item,
  subject,
  showDetails,
  tight,
  onToggle,
  onOpen,
}: RowProps & { tight: boolean }) {
  return (
    <div
      className={tight ? 'm-card m-card--tight' : 'm-card'}
      data-done={item.done}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="m-card__head">
        <MobileChip subject={subject} done={item.done} />
        <MobileCheckbox
          done={item.done}
          label={item.done ? 'Mark as not done' : 'Mark as done'}
          onToggle={onToggle}
          small={tight}
        />
      </div>
      <div className="m-card__title">{item.description || 'Untitled'}</div>
      {showDetails && item.details && <div className="m-card__details">{item.details}</div>}
      {!item.done && item.time && <div className="m-card__meta">{item.time}</div>}
    </div>
  );
}
