import { buildWindow, dayName, dayOfMonth, startOfWeek, todayISO } from '../../lib/dates';
import { subjectAccent } from '../../lib/color';
import type { Item, RecurringItem, Subject } from '../../types';
import { isWithin } from '../../lib/dates';

interface Props {
  /** Leftmost day currently shown. */
  anchorDate: string;
  /** How many days the view is showing, so the selection can span them. */
  days: number;
  items: Item[];
  recurring: RecurringItem[];
  subjects: Subject[];
  onPick: (date: string) => void;
}

/** At most three dots fit under a date before they start to crowd it. */
const MAX_DOTS = 3;

/**
 * The seven days of the week containing the anchor, replacing the desktop's
 * day-header cells. The days on screen are drawn as one continuous block
 * rather than separate selected cells, so a two- or three-day window reads as
 * a range rather than as three coincidental selections.
 */
export function WeekStrip({ anchorDate, days, items, recurring, subjects, onPick }: Props) {
  const week = buildWindow(startOfWeek(anchorDate), 7);
  const today = todayISO();
  // A two- or three-day window can run past Sunday; the strip shows the part
  // of it that falls in this week and the rest appears when it is scrolled to.
  const firstShown = week.indexOf(anchorDate);
  const lastShown = Math.min(week.length - 1, firstShown + days - 1);

  const hueOf = (id: string | null) => subjects.find((s) => s.id === id)?.hue ?? null;

  function dotsFor(date: string): (number | null)[] {
    const hues: (number | null)[] = [];
    for (const i of items.filter((i) => i.date === date)) hues.push(hueOf(i.subjectId));
    for (const r of recurring.filter((r) => isWithin(date, r.startDate, r.endDate))) {
      hues.push(hueOf(r.subjectId));
    }
    // One dot per subject: three items for one course is still one colour.
    return [...new Set(hues)].slice(0, MAX_DOTS);
  }

  return (
    <div className="m-strip">
      {week.map((date, i) => {
        const shown = i >= firstShown && i <= lastShown;
        const isToday = date === today;
        const weekend = i >= 5;
        return (
          <button
            key={date}
            type="button"
            className="m-strip__cell"
            data-shown={shown}
            data-first={shown && i === firstShown}
            data-last={shown && i === lastShown}
            data-weekend={weekend}
            aria-label={`${dayName(date)} ${dayOfMonth(date)}`}
            aria-pressed={shown}
            onClick={() => onPick(date)}
          >
            <span className="m-strip__label">{dayName(date).slice(0, 3)}</span>
            <span className="m-strip__date" data-today={isToday}>
              {dayOfMonth(date)}
            </span>
            <span className="m-strip__dots">
              {dotsFor(date).map((hue, n) => (
                <span key={n} className="m-strip__dot" style={{ background: subjectAccent(hue) }} />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
