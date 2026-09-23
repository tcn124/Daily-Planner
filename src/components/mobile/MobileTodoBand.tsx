import { useEffect, useRef, useState } from 'react';
import type { TodoItem } from '../../types';

interface Props {
  todos: TodoItem[];
  onAdd: (text: string) => void;
  onToggle: (id: string) => void;
  onClearDone: () => void;
}

/**
 * The desktop's bottom strip, as a band in the scroll.
 *
 * A pill has no ✕ here — at 36pt the two tap targets would sit on top of each
 * other. Tapping toggles done, and "Clear done" in the band header is how
 * finished notes leave.
 */
export function MobileTodoBand({ todos, onAdd, onToggle, onClearDone }: Props) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const open = todos.filter((t) => !t.done).length;
  const anyDone = todos.some((t) => t.done);

  function commit() {
    const trimmed = text.trim();
    if (trimmed) onAdd(trimmed);
    setText('');
  }

  return (
    <>
      <div className="m-band">
        <span className="m-band__label">To-do</span>
        <span className="m-band__count">{open} open</span>
        {anyDone && (
          <button type="button" className="m-band__action" onClick={onClearDone}>
            Clear done
          </button>
        )}
      </div>

      <div className="m-pills">
        {todos.map((todo) => (
          <button
            key={todo.id}
            type="button"
            className="m-pill"
            data-done={todo.done}
            aria-pressed={todo.done}
            onClick={() => onToggle(todo.id)}
          >
            {todo.text}
          </button>
        ))}

        {adding ? (
          <input
            ref={inputRef}
            className="m-pill m-pill--input"
            value={text}
            placeholder="New note"
            aria-label="New to-do"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              }
              // Escape leaves the field; a blank one closes it on blur anyway.
              if (e.key === 'Escape') setAdding(false);
            }}
            onBlur={() => {
              commit();
              setAdding(false);
            }}
          />
        ) : (
          <button type="button" className="m-pill m-pill--add" onClick={() => setAdding(true)}>
            + Add
          </button>
        )}
      </div>
    </>
  );
}
