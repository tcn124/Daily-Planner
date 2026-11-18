import { useState, type ReactNode } from 'react';
import { buildWindow, dayName, dayOfMonth, isWithin, startOfWeek, todayISO } from '../../lib/dates';

interface Props {
  /** Which week to draw: the one containing this date. */
  weekOf: string;
  /** Filled in ink — the chosen day, or a range's two ends. */
  selected: string[];
  /** A range's interior, shaded between its ends. */
  range?: { start: string; end: string };
  onPick: (date: string) => void;
  /** The link under the strip — "Other date…" or "Longer than a week…". */
  otherLabel?: string;
  /**
   * What the link opens. Defaults to a single native date input feeding
   * `onPick`; the recurring composer passes its own start/end pair instead.
   */
  other?: ReactNode;
}

/**
 * The header's week strip, used again inside sheets so that picking a day
 * feels the same everywhere (frame 5a's "Due", 5b's "Runs", 5c's "Move to").
 * Seven 54pt cells; a chosen day is filled ink, a range's interior is shaded,
 * today stays blue. Anything outside the week goes through "Other date…".
 */
export function DayStrip({ weekOf, selected, range, onPick, otherLabel = 'Other date…', other }: Props) {
  const [showOther, setShowOther] = useState(false);
  const week = buildWindow(startOfWeek(weekOf), 7);
  const today = todayISO();

  return (
    <>
      <div className="m-daystrip">
        {week.map((date) => {
          const isSelected = selected.includes(date);
          const inRange = !!range && !isSelected && isWithin(date, range.start, range.end);
          return (
            <button
              key={date}
              type="button"
              className="m-daystrip__cell"
              data-selected={isSelected}
              data-range={inRange}
              data-today={date === today}
              aria-pressed={isSelected}
              aria-label={`${dayName(date)} ${dayOfMonth(date)}`}
              onClick={() => onPick(date)}
            >
              <span className="m-daystrip__label">{dayName(date).slice(0, 3)}</span>
              <span className="m-daystrip__date">{dayOfMonth(date)}</span>
            </button>
          );
        })}
      </div>
      {showOther ? (
        <div className="m-daystrip__other">
          {other ?? (
            <input
              type="date"
              className="m-input"
              aria-label="Date"
              defaultValue={selected[0] ?? ''}
              onChange={(e) => {
                if (e.target.value) onPick(e.target.value);
              }}
            />
          )}
        </div>
      ) : (
        <button type="button" className="m-linkrow" onClick={() => setShowOther(true)}>
          {otherLabel}
        </button>
      )}
    </>
  );
}
