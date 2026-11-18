import { formatSpan, isoWeek, monthLong, year } from '../lib/dates';
import {
  goToToday,
  setDays,
  shiftAnchor,
  useDevicePrefs,
} from '../store/devicePrefs';
import { DaysStepper } from './DaysStepper';
import { ChevronLeft, ChevronRight, Plus } from './icons';

interface Props {
  window: string[];
  onNewItem: () => void;
}

/**
 * The week view's contribution to the header: the month as the display title
 * ("October."), the year and week beside it, and the controls set as text.
 */
export function WeekBar({ window: window_, onNewItem }: Props) {
  const { anchorDate, daysVisible } = useDevicePrefs();

  return (
    <div className="viewbar">
      <div className="viewbar__lead">
        <h1 className="viewbar__title">{monthLong(anchorDate)}.</h1>
        <div className="viewbar__eyebrow">
          <span className="viewbar__eyebrow-soft">{year(anchorDate)}</span>
          <span>
            Week {isoWeek(anchorDate)} — {formatSpan(window_)}
          </span>
        </div>
      </div>

      <div className="viewbar__actions">
        <div className="navgroup">
          <button
            type="button"
            className="navgroup__arrow"
            aria-label="Previous day"
            onClick={() => shiftAnchor(-1)}
          >
            <ChevronLeft />
          </button>
          <button type="button" className="link navgroup__today" onClick={goToToday}>
            Today
          </button>
          <button
            type="button"
            className="navgroup__arrow"
            aria-label="Next day"
            onClick={() => shiftAnchor(1)}
          >
            <ChevronRight />
          </button>
        </div>

        <DaysStepper value={daysVisible} onChange={(days) => setDays(days)} />

        <button type="button" className="link viewbar__new" onClick={onNewItem}>
          New item <Plus />
        </button>
      </div>
    </div>
  );
}
