import type { Item, Subject } from '../types';
import { subjectDesc, subjectFill, subjectLabel } from '../lib/color';

interface Props {
  item: Item;
  subject: Subject | null;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: () => void;
}

export function ItemCard({ item, subject, onToggle, onDelete, onEdit }: Props) {
  const hue = subject?.hue ?? null;
  const label = subjectLabel(hue);

  return (
    <div
      className={item.done ? 'card card--done' : 'card'}
      style={{ background: subjectFill(hue) }}
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
        {item.time && (
          <>
            <span className="card__dot" aria-hidden="true" />
            <span className="card__time">{item.time}</span>
          </>
        )}
      </div>

      {item.description && (
        <div className="card__desc" style={{ color: subjectDesc(hue) }}>
          {item.description}
        </div>
      )}

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
          aria-label="Delete item"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        />
      </div>
    </div>
  );
}
