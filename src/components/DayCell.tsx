import type { Item, ItemType, Subject } from '../types';
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
  items: Item[];
  subjects: Subject[];
  composer: ComposerTarget | null;
  onOpenComposer: (target: ComposerTarget) => void;
  onCloseComposer: () => void;
  onSubmit: (value: ComposerValue) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onCreateSubject: (name: string, hue: number | null) => string;
}

export function DayCell({
  date,
  type,
  items,
  subjects,
  composer,
  onOpenComposer,
  onCloseComposer,
  onSubmit,
  onToggle,
  onDelete,
  onCreateSubject,
}: Props) {
  const isOpen = composer?.date === date && composer.type === type;
  const editing = isOpen && composer.itemId
    ? items.find((i) => i.id === composer.itemId) ?? null
    : null;

  return (
    <div className="cell">
      {items.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          subject={subjects.find((s) => s.id === item.subjectId) ?? null}
          onToggle={() => onToggle(item.id)}
          onDelete={() => onDelete(item.id)}
          onEdit={() => onOpenComposer({ date, type, itemId: item.id })}
        />
      ))}

      {!isOpen && (
        <button
          type="button"
          className="cell__add"
          aria-label={`Add ${type} on ${date}`}
          onClick={() => onOpenComposer({ date, type, itemId: null })}
        />
      )}

      {isOpen && (
        <ItemComposer
          subjects={subjects}
          title={editing ? 'Edit Item' : 'Add Item'}
          submitLabel={editing ? 'Save' : 'Add'}
          initial={
            editing
              ? {
                  subjectId: editing.subjectId,
                  description: editing.description,
                  time: editing.time,
                }
              : undefined
          }
          onSubmit={onSubmit}
          onCancel={onCloseComposer}
          onCreateSubject={onCreateSubject}
        />
      )}
    </div>
  );
}
