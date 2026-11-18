import type { DragEvent } from 'react';
import type { Item, Subject } from '../types';
import { startItemDrag } from '../lib/dnd';
import { SubjectSquare } from './SubjectSquare';
import { compactTime } from '../lib/format';

interface Props {
  item: Item;
  subject: Subject | null;
  /** True while this card is the one being dragged. */
  dragging: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

/**
 * A white panel with a serif subject line, the title, and clamped details —
 * the redesign's card. At rest it carries no controls at all; the square
 * checkbox and ✕ take the time's place on hover, and a click opens the
 * editor as it always has.
 */
export function ItemCard({
  item,
  subject,
  dragging,
  onToggle,
  onDelete,
  onEdit,
  onDragStart,
  onDragEnd,
}: Props) {
  function startDrag(e: DragEvent<HTMLDivElement>) {
    startItemDrag(e, item.id);
    onDragStart();
  }

  const title = item.description || 'Untitled';

  return (
    <div
      className={[
        'card',
        item.done ? 'card--done' : '',
        dragging ? 'card--dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      draggable
      onDragStart={startDrag}
      onDragEnd={onDragEnd}
      onClick={onEdit}
      role="button"
      tabIndex={0}
      aria-label={`${subject?.name ?? 'No subject'}: ${title}${item.done ? ', done' : ''}`}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onEdit();
        }
      }}
    >
      <div className="card__head">
        <SubjectSquare hue={subject?.hue ?? null} dim={item.done} />
        <span className="card__subject">{subject?.name ?? 'No subject'}</span>
        {item.time && <span className="card__time">{compactTime(item.time)}</span>}
        <span className="card__actions">
          <button
            type="button"
            className="kill"
            aria-label={`Delete ${title}`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          />
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
        </span>
      </div>

      <div className="card__desc">{title}</div>
      {item.details && (
        <div className="card__details" title={item.details}>
          {item.details}
        </div>
      )}
    </div>
  );
}
