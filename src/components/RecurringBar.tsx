import type { MouseEvent } from 'react';
import type { RecurringItem, Subject } from '../types';
import { subjectDesc, subjectFill, subjectLabel } from '../lib/color';

interface Props {
  item: RecurringItem;
  subject: Subject | null;
  /** Left edge and width as fractions (0–1) of the track, honouring column widths. */
  leftFrac: number;
  widthFrac: number;
  row: number;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onResizeStart: (edge: 'start' | 'end', e: MouseEvent) => void;
}

export function RecurringBar({
  item,
  subject,
  leftFrac,
  widthFrac,
  row,
  onToggle,
  onDelete,
  onEdit,
  onResizeStart,
}: Props) {
  const hue = subject?.hue ?? null;
  const label = subjectLabel(hue);

  return (
    <div
      className={item.done ? 'card card--done rec-bar' : 'card rec-bar'}
      style={{
        left: `calc(${leftFrac * 100}% + 4px)`,
        width: `calc(${widthFrac * 100}% - 8px)`,
        top: 6 + row * 44,
        background: subjectFill(hue),
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
      <span className="card__bar" style={{ background: label }} aria-hidden="true" />

      <div className="card__head" style={{ color: label }}>
        <span className="card__subject">{subject?.name ?? 'No subject'}</span>
      </div>

      {item.title && (
        <div className="card__desc" style={{ color: subjectDesc(hue) }}>
          {item.title}
        </div>
      )}

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

      <div className="card__controls" style={{ color: label }}>
        <button
          type="button"
          className="checkbox"
          data-checked={item.done}
          aria-label={item.done ? 'Mark as not done' : 'Mark as done'}
          aria-pressed={item.done}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        />
        <button
          type="button"
          className="kill"
          aria-label="Delete recurring item"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        />
      </div>
    </div>
  );
}
