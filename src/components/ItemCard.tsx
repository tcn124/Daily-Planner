import type { DragEvent } from 'react';
import type { Item, Subject } from '../types';
import { subjectChipBg, subjectChipInk } from '../lib/color';
import { startItemDrag } from '../lib/dnd';

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
  // Completed cards drop to the neutral chip, as in the design.
  const hue = item.done ? null : subject?.hue ?? null;

  function startDrag(e: DragEvent<HTMLDivElement>) {
    startItemDrag(e, item.id);
    onDragStart();
  }

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
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onEdit();
        }
      }}
    >
      <div className="card__head">
        <span
          className="chip"
          style={{ background: subjectChipBg(hue), color: subjectChipInk(hue) }}
        >
          {subject?.name ?? 'No subject'}
        </span>

        <button
          type="button"
          className="kill card__kill"
          aria-label={`Delete ${item.description || 'item'}`}
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
      </div>

      {item.description && <div className="card__desc">{item.description}</div>}
      {item.details && (
        <div className="card__details" title={item.details}>
          {item.details}
        </div>
      )}
      {item.time && <div className="card__time">{item.time}</div>}
    </div>
  );
}
