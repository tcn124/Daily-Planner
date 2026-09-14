import type { MouseEvent } from 'react';
import type { RecurringItem, Subject } from '../types';
import { subjectAccent, subjectChipBg, subjectChipInk } from '../lib/color';
import { dayName, dayOfMonth } from '../lib/dates';
import { ROW_H, isFullyDone } from '../lib/recurring';

interface Props {
  item: RecurringItem;
  subject: Subject | null;
  /** The dates this bar covers within the rendered track, left to right. */
  dates: string[];
  /** Left edge and width as fractions (0–1) of the track, honouring column widths. */
  leftFrac: number;
  widthFrac: number;
  row: number;
  onToggleDay: (date: string) => void;
  onDelete: () => void;
  onEdit: () => void;
  onResizeStart: (edge: 'start' | 'end', e: MouseEvent) => void;
  onMoveStart: (e: MouseEvent) => void;
}

export function RecurringBar({
  item,
  subject,
  dates,
  leftFrac,
  widthFrac,
  row,
  onToggleDay,
  onDelete,
  onEdit,
  onResizeStart,
  onMoveStart,
}: Props) {
  const done = isFullyDone(item);
  const hue = done ? null : subject?.hue ?? null;
  const short = (iso: string) => dayName(iso).slice(0, 3);

  return (
    <div
      className={done ? 'rec-bar rec-bar--done' : 'rec-bar'}
      style={{
        left: `calc(${leftFrac * 100}% + 4px)`,
        width: `calc(${widthFrac * 100}% - 8px)`,
        top: 6 + row * ROW_H,
        borderLeftColor: subjectAccent(subject?.hue ?? null),
      }}
      onMouseDown={(e) => {
        // Controls and the resize grips handle their own presses.
        if ((e.target as HTMLElement).closest('button, .rec-bar__handle')) return;
        onMoveStart(e);
      }}
      onClick={onEdit}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onEdit();
        }
      }}
    >
      {/*
        One invisible segment per day, laid over the bar. Hovering a segment
        reveals that day's checkbox; a ticked day shades its segment. They sit
        underneath the label so the text stays readable, and the label lets
        pointer events fall through so hovering over text still finds the day.
      */}
      <div
        className="rec-bar__segs"
        style={{ gridTemplateColumns: `repeat(${dates.length}, 1fr)` }}
        aria-hidden={false}
      >
        {dates.map((date) => {
          const checked = item.doneDates.includes(date);
          const label = `${short(date)} ${dayOfMonth(date)}`;
          return (
            <div
              key={date}
              className={checked ? 'rec-bar__seg rec-bar__seg--done' : 'rec-bar__seg'}
              title={label}
            >
              <button
                type="button"
                className="checkbox rec-bar__day"
                data-checked={checked}
                aria-label={`${checked ? 'Unmark' : 'Mark'} ${label} as done`}
                aria-pressed={checked}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleDay(date);
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="rec-bar__main">
        <span
          className="chip"
          style={{ background: subjectChipBg(hue), color: subjectChipInk(hue) }}
        >
          {subject?.name ?? 'No subject'}
        </span>

        {item.title && <span className="rec-bar__title">{item.title}</span>}

        <span className="rec-bar__range">
          {short(item.startDate)} – {short(item.endDate)}
        </span>

        <button
          type="button"
          className="kill rec-bar__kill"
          aria-label={`Delete ${item.title || 'recurring item'}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        />
      </div>

      {/* Invisible edge grips — the design shows no handles, so they only
          change the cursor. */}
      <span
        className="rec-bar__handle rec-bar__handle--start"
        onMouseDown={(e) => {
          e.stopPropagation();
          onResizeStart('start', e);
        }}
      />
      <span
        className="rec-bar__handle rec-bar__handle--end"
        onMouseDown={(e) => {
          e.stopPropagation();
          onResizeStart('end', e);
        }}
      />
    </div>
  );
}
