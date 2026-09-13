import { useEffect, useRef, useState } from 'react';
import type { TodoItem } from '../types';

interface Props {
  todos: TodoItem[];
  onAddTodo: (text: string) => void;
  onToggleTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
  onOpenList: () => void;
  onOpenSettings: () => void;
  onQuickAdd: () => void;
  /** "list" on the grid, "weekly" on the list view. */
  listLabel?: string;
}

export function ScratchpadFooter({
  todos,
  onAddTodo,
  onToggleTodo,
  onDeleteTodo,
  onOpenList,
  onOpenSettings,
  onQuickAdd,
  listLabel = 'list',
}: Props) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  function commit() {
    const trimmed = text.trim();
    if (trimmed) onAddTodo(trimmed);
    setText('');
  }

  return (
    <div className="footer">
      <span className="footer__label">To-Do:</span>

      <div className="scratch">
        {todos.map((todo) => (
          <span
            key={todo.id}
            className="chip"
            data-done={todo.done}
            role="button"
            tabIndex={0}
            onClick={() => onToggleTodo(todo.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onToggleTodo(todo.id);
              }
            }}
          >
            {todo.text}
            <button
              type="button"
              className="kill"
              aria-label={`Delete ${todo.text}`}
              onClick={(e) => {
                e.stopPropagation();
                onDeleteTodo(todo.id);
              }}
            />
          </span>
        ))}

        {adding ? (
          <input
            ref={inputRef}
            className="field scratch__input"
            placeholder="Add a note, then press Enter"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setText('');
                setAdding(false);
              }
            }}
            onBlur={() => {
              commit();
              setAdding(false);
            }}
          />
        ) : (
          <button
            type="button"
            className="scratch__add"
            aria-label="Add to-do"
            onClick={() => setAdding(true)}
          />
        )}
      </div>

      <div className="footer__actions">
        <button type="button" onClick={onOpenList}>
          {listLabel}
        </button>
        <button type="button" onClick={onOpenSettings}>
          edit
        </button>
        <button type="button" onClick={onQuickAdd}>
          add
        </button>
      </div>
    </div>
  );
}
