import type { Item, ItemType, Subject } from '../types';
import { useDropTarget } from '../lib/dnd';
import { ItemCard } from './ItemCard';
import { ItemComposer, type ComposerValue } from './ItemComposer';

export interface ComposerTarget {
  date: string;
  type: ItemType;
  /** Set when editing an existing card rather than creating a new one. */
  itemId: string | null;
}

interface Props {
  date: string;
  type: ItemType;
  /** Weekend and today columns take the alternate tint from the design. */
  tinted: boolean;
  /** Anchor the composer to the cell's right edge — used near the viewport edge. */
  flipComposer: boolean;
  items: Item[];
  subjects: Subject[];
  composer: ComposerTarget | null;
  /** Id of the card currently being dragged anywhere in the grid, if any. */
  draggingId: string | null;
  onOpenComposer: (target: ComposerTarget) => void;
  onCloseComposer: () => void;
  onSubmit: (value: ComposerValue) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onCreateSubject: (name: string, hue: number | null) => string;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDropItem: (id: string, date: string, type: ItemType) => void;
}

export function DayCell({
  date,
  type,
  tinted,
  flipComposer,
  items,
  subjects,
  composer,
  draggingId,
  onOpenComposer,
  onCloseComposer,
  onSubmit,
  onToggle,
  onDelete,
  onCreateSubject,
  onDragStart,
  onDragEnd,
  onDropItem,
}: Props) {
  const isOpen = composer?.date === date && composer.type === type;
  const editing = isOpen && composer.itemId
    ? items.find((i) => i.id === composer.itemId) ?? null
    : null;

  const { over, handlers } = useDropTarget(draggingId, (id) => onDropItem(id, date, type));

  return (
    <div
      className={[
        'cell',
        tinted ? 'cell--tinted' : '',
        flipComposer ? 'cell--flip-composer' : '',
        over ? 'cell--drop' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...handlers}
    >
      {items.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          subject={subjects.find((s) => s.id === item.subjectId) ?? null}
          dragging={draggingId === item.id}
          onToggle={() => onToggle(item.id)}
          onDelete={() => onDelete(item.id)}
          onEdit={() => onOpenComposer({ date, type, itemId: item.id })}
          onDragStart={() => onDragStart(item.id)}
          onDragEnd={onDragEnd}
        />
      ))}

      {!isOpen && (
        <button
          type="button"
          className="cell__add"
          aria-label={`Add ${type} on ${date}`}
          onClick={() => onOpenComposer({ date, type, itemId: null })}
        >
          + Add
        </button>
      )}

      {isOpen && (
        <ItemComposer
          subjects={subjects}
          date={date}
          title={editing ? 'Edit item' : `New ${type}`}
          submitLabel={editing ? 'Save' : 'Add item'}
          initial={
            editing
              ? {
                  subjectId: editing.subjectId,
                  description: editing.description,
                  details: editing.details,
                  time: editing.time,
                  type: editing.type,
                }
              : { type }
          }
          onSubmit={onSubmit}
          onCancel={onCloseComposer}
          onCreateSubject={onCreateSubject}
        />
      )}
    </div>
  );
}
