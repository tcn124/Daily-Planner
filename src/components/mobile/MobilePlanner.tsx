import { useEffect, useRef, useState } from 'react';
import { usePlanner } from '../../store/plannerStore';
import { missedItems } from '../../lib/missed';
import { lateLong } from '../../lib/format';
import { todayISO } from '../../lib/dates';
import { DEFAULT_HUE } from '../../store/defaults';
import { formatRelativeTime, useSyncStatus } from '../../sync/status';
import { SubjectSquare } from '../SubjectSquare';
import { ChevronRight, Close } from '../icons';
import { subjectOf } from './MobileRows';
import { useSheets } from './sheets';
import { useRowActions } from './rowActions';

interface Props {
  /** Opens the List tab narrowed to one subject. */
  onOpenSubject: (id: string) => void;
}

/**
 * The third tab (frame 5h): what the desktop sidebar holds that is not a view
 * — Missed, To-do, Subjects — and the way into Edit planner.
 *
 * The sync line beside the masthead only renders once there is something true
 * to say; not configured, or not signed in yet, and it stays off rather than
 * showing a status that describes nothing.
 */
export function MobilePlanner({ onOpenSubject }: Props) {
  const { state, dispatch } = usePlanner();
  const { openItem, openPlanner } = useSheets();
  const { moveToToday } = useRowActions();
  const syncStatus = useSyncStatus();
  const { subjects, items, recurring, todos } = state;
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const today = todayISO();
  const missed = missedItems(items, today);

  /*
   * Counted as the List counts them — an item once, a span once — because
   * tapping a subject opens the List filtered to it, so the number is a
   * promise about what appears there.
   */
  const countFor = (id: string) =>
    items.filter((i) => i.subjectId === id).length +
    recurring.filter((r) => r.subjectId === id).length;

  function addSubject() {
    dispatch({
      type: 'subject/add',
      name: 'New subject',
      // Spread new subjects around the wheel so they stay distinct.
      hue: (DEFAULT_HUE + subjects.length * 47) % 360,
    });
    openPlanner();
  }

  function commitTodo() {
    const trimmed = text.trim();
    if (trimmed) dispatch({ type: 'todo/add', text: trimmed });
    setText('');
  }

  const openTodos = todos.filter((t) => !t.done).length;

  return (
    <div className="m-planner">
      <div className="m-head">
        <div className="m-head__lead">
          <h1 className="m-head__title">Planner.</h1>
          {syncStatus.phase === 'synced' && (
            <span className="m-head__sub">
              {syncStatus.lastSyncedAt == null
                ? 'Synced with desktop'
                : `Synced with desktop · ${formatRelativeTime(syncStatus.lastSyncedAt)}`}
            </span>
          )}
        </div>
      </div>

      {missed.length > 0 && (
        <section>
          <div className="m-sec m-sec--big">
            <span className="m-sec__title">Missed</span>
            <span className="m-sec__count m-late">{missed.length}</span>
          </div>
          <div className="m-rows">
            {missed.map((item) => {
              const subject = subjectOf(subjects, item.subjectId);
              return (
                <div key={item.id} className="m-missedrow">
                  <SubjectSquare hue={subject?.hue ?? null} />
                  <span className="m-missedrow__body">
                    <span className="m-missedrow__title">{item.description || 'Untitled'}</span>
                    <span className="m-missedrow__meta">
                      {subject?.name ?? 'No subject'} ·{' '}
                      <span className="m-late">{lateLong(item.date, today)}</span>
                    </span>
                  </span>
                  <button
                    type="button"
                    className="m-more"
                    aria-label={`Actions for ${item.description || 'item'}`}
                    onClick={() => openItem({ kind: 'item', id: item.id, date: item.date })}
                  >
                    ⋯
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              className="m-action m-action--plain"
              onClick={() => moveToToday(missed.map((i) => i.id))}
            >
              Move all to today →
            </button>
          </div>
        </section>
      )}

      <section>
        <div className="m-sec m-sec--big">
          <span className="m-sec__title">To-do</span>
          <span className="m-sec__count">{openTodos}</span>
          {todos.some((t) => t.done) && (
            <button
              type="button"
              className="m-sec__action"
              onClick={() => dispatch({ type: 'todo/clearDone' })}
            >
              Clear done
            </button>
          )}
        </div>
        <div className="m-rows">
          {todos.map((todo) => (
            <div key={todo.id} className="m-todo" data-done={todo.done}>
              <button
                type="button"
                className="m-todo__main"
                role="checkbox"
                aria-checked={todo.done}
                onClick={() => dispatch({ type: 'todo/toggle', id: todo.id })}
              >
                <span className="m-todo__box" aria-hidden="true" />
                <span className="m-todo__text">{todo.text}</span>
              </button>
              <button
                type="button"
                className="m-todo__kill"
                aria-label={`Delete ${todo.text}`}
                onClick={() => dispatch({ type: 'todo/delete', id: todo.id })}
              >
                <Close size={10} />
              </button>
            </div>
          ))}
          {adding ? (
            <div className="m-todo m-todo--input">
              <input
                ref={inputRef}
                className="m-input"
                value={text}
                placeholder="New to-do"
                aria-label="New to-do"
                enterKeyHint="done"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitTodo();
                  }
                  if (e.key === 'Escape') setAdding(false);
                }}
                onBlur={() => {
                  commitTodo();
                  setAdding(false);
                }}
              />
            </div>
          ) : (
            <button type="button" className="m-action m-action--muted" onClick={() => setAdding(true)}>
              + Add to-do
            </button>
          )}
        </div>
      </section>

      <section>
        <div className="m-sec m-sec--big">
          <span className="m-sec__title">Subjects</span>
          <button type="button" className="m-sec__action" onClick={openPlanner}>
            Edit
          </button>
        </div>
        <div className="m-rows">
          {subjects.map((s) => (
            <button key={s.id} type="button" className="m-subjectrow"
              onClick={() => onOpenSubject(s.id)}>
              <SubjectSquare hue={s.hue} />
              <span className="m-subjectrow__name">{s.name}</span>
              <span className="m-subjectrow__count">{countFor(s.id)}</span>
              <ChevronRight strokeWidth={1.3} />
            </button>
          ))}
          <button type="button" className="m-action m-action--muted" onClick={addSubject}>
            + New subject
          </button>
        </div>
      </section>

      <div className="m-rows m-planner__foot">
        <button type="button" className="m-action" onClick={openPlanner}>
          <span className="m-action__glyph" aria-hidden="true">⚙</span>
          <span className="m-action__label">Edit planner</span>
          <span className="m-action__chevron" aria-hidden="true">›</span>
        </button>
      </div>
    </div>
  );
}
