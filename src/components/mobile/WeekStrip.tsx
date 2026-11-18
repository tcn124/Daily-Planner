import { buildWindow, dayName, dayOfMonth, startOfWeek, todayISO } from '../../lib/dates';

interface Props {
  /** Leftmost day currently shown. */
  anchorDate: string;
  /** How many days the view is showing, so the selection can span them. */
  days: number;
  onPick: (date: string) => void;
}

/**
 * The seven days of the week containing the anchor. The days on screen are
 * one shaded block rather than separate selected cells, so a two- or three-day
 * window reads as a range (frames 4a–4c). Today is blue and bold wherever it
 * falls, shaded or not.
 */
export function WeekStrip({ anchorDate, days, onPick }: Props) {
  const week = buildWindow(startOfWeek(anchorDate), 7);
  const today = todayISO();
  // A two- or three-day window can run past Sunday; the strip shows the part
  // of it that falls in this week and the rest appears when it is scrolled to.
  const firstShown = week.indexOf(anchorDate);
  const lastShown = Math.min(week.length - 1, firstShown + days - 1);

  return (
    <div className="m-strip">
      {week.map((date, i) => {
        const shown = i >= firstShown && i <= lastShown;
        return (
          <button
            key={date}
            type="button"
            className="m-strip__cell"
            data-shown={shown}
            data-first={shown && i === firstShown}
            data-last={shown && i === lastShown}
            data-today={date === today}
            aria-label={`${dayName(date)} ${dayOfMonth(date)}`}
            aria-pressed={shown}
            onClick={() => onPick(date)}
          >
            <span className="m-strip__label">{dayName(date).slice(0, 3)}</span>
            <span className="m-strip__date">{dayOfMonth(date)}</span>
          </button>
        );
      })}
    </div>
  );
}
