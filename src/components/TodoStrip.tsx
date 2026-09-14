import { useEffect, useRef, useState } from 'react';
import type { TodoItem } from '../types';

interface Props {
  todos: TodoItem[];
  onAddTodo: (text: string) => void;
  onToggleTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
}

/**
 * The strip along the bottom of the week and list views. View switching and
 * settings used to live here too; they moved to the sidebar and header, so this
 * is now only the to-do list.
 */
export function TodoStrip({ todos, onAddTodo, onToggleTodo, onDeleteTodo }: Props) {
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
    <div className="todo">
      <span className="todo__label">To-do</span>

      <div className="todo__list">
        {todos.map((todo) => (
          <span
            key={todo.id}
            className="todo-chip"
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
              className="kill todo-chip__kill"
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
            className="todo__input"
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
          <button type="button" className="todo__add" onClick={() => setAdding(true)}>
            + Add note
          </button>
        )}
      </div>
    </div>
  );
}
