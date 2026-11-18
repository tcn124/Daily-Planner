import { useState } from 'react';
import { createPortal } from 'react-dom';
import { usePlanner } from '../store/plannerStore';
import { dayName, dayOfMonth, shortDate, todayISO } from '../lib/dates';
import { missedItems } from '../lib/missed';
import { compactTime, lateShort, pad2 } from '../lib/format';
import { uid } from '../store/defaults';
import { ItemComposer, type ComposerValue } from './ItemComposer';
import { SubjectSquare } from './SubjectSquare';
import type { Item } from '../types';

interface Props {
  /** The header's content slot; the title and controls render into it. */
  slot: HTMLElement | null;
  onClose: () => void;
  /** Opens the day page an item was due on. */
  onOpenDay: (date: string) => void;
}

/**
 * Every missed item on one desktop page. The sidebar only has room for the
 * first three; this is where the rest live, laid out like the List (frame
 * 2d): each original due day is a block, its rows in Subject · Item · Due ·
 * Late columns.
 *
 * Missed stays derived (`missedItems`): an item leaves this page the moment
 * it is ticked off or moved to today or later, so there is nothing to store.
 */
export function MissedPage({ slot, onClose, onOpenDay }: Props) {
  const { state, dispatch } = usePlanner();
  const { subjects } = state;
  const [editingId, setEditingId] = useState<string | null>(null);

  const today = todayISO();
  const missed = missedItems(state.items, today);

  const byDate = new Map<string, Item[]>();
  for (const item of missed) byDate.set(item.date, [...(byDate.get(item.date) ?? []), item]);
  const dates = [...byDate.keys()].sort();

  const subjectOf = (id: string | null) => subjects.find((s) => s.id === id) ?? null;

  function moveToToday(id: string) {
    dispatch({ type: 'item/update', id, patch: { date: today } });
  }

  function createSubject(name: string, hue: number | null): string {
    const id = uid();
    dispatch({ type: 'subject/add', name, hue, id });
    return id;
  }

  function save(id: string, value: ComposerValue) {
    dispatch({ type: 'item/update', id, patch: value });
    setEditingId(null);
  }

  return (
    <div className="list missed">
      {slot &&
        createPortal(
          <div className="viewbar">
            <div className="viewbar__lead">
              <h1 className="viewbar__title">Missed.</h1>
              <div className="viewbar__eyebrow">
                <span className="viewbar__eyebrow-soft">
                  {dates.length ? `Since ${shortDate(dates[0])}` : 'All caught up'}
                </span>
                <span>
                  {missed.length} overdue
                </span>
              </div>
            </div>
            <div className="viewbar__actions">
              <button type="button" className="link" onClick={onClose}>
                ← Back to week
              </button>
              {missed.length > 0 && (
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    for (const item of missed) moveToToday(item.id);
                  }}
                >
                  Move all to today →
                </button>
              )}
            </div>
          </div>,
          slot,
        )}

      <div className="list__colheads" aria-hidden="true">
        <span>Was due</span>
        <span>Subject</span>
        <span>Item</span>
        <span>Time</span>
        <span className="list__colhead-due">Late</span>
      </div>

      <div className="list__body">
        {dates.length === 0 && (
          <div className="missed__empty">
            <span className="missed__empty-title">Nothing missed.</span>
            <p className="missed__empty-note">
              Anything still open after its day has passed shows up here.
            </p>
          </div>
        )}

        {dates.map((date) => {
          const rows = byDate.get(date) ?? [];
          return (
            <section key={date} className="list__section">
              <button type="button" className="list__group missed__day" data-past
                title={`Open ${dayName(date)}`} onClick={() => onOpenDay(date)}>
                <span className="list__group-name">{dayName(date).slice(0, 3)}</span>
                <span className="list__group-date">{dayOfMonth(date)}.</span>
                <span className="count">{pad2(rows.length)}</span>
              </button>

              <div className="list__rows">
                {rows.map((item) => {
                  const subject = subjectOf(item.subjectId);
                  const title = item.description || 'Untitled';
                  if (editingId === item.id) {
                    return (
                      <div key={item.id} className="list__composer">
                        <ItemComposer
                          subjects={subjects}
                          date={item.date}
                          title="Edit item"
                          submitLabel="Save"
                          initial={item}
                          onSubmit={(v) => save(item.id, v)}
                          onCancel={() => setEditingId(null)}
                          onCreateSubject={createSubject}
                        />
                      </div>
                    );
                  }
                  return (
                    <div
                      key={item.id}
                      className="list__row"
                      role="button"
                      tabIndex={0}
                      onClick={() => setEditingId(item.id)}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setEditingId(item.id);
                        }
                      }}
                    >
                      <span className="list__subject">
                        <SubjectSquare hue={subject?.hue ?? null} />
                        <span className="list__subject-name">{subject?.name ?? 'No subject'}</span>
                      </span>
                      <span className="list__desc">
                        <span className="list__title">{title}</span>
                        {item.details && (
                          <span className="list__details" title={item.details}>{item.details}</span>
                        )}
                      </span>
                      <span className="list__type">{compactTime(item.time)}</span>
                      <span className="list__due" data-late>
                        {lateShort(item.date, today)}
                      </span>
                      <span className="list__row-actions missed__actions">
                        <button
                          type="button"
                          className="link"
                          onClick={(e) => {
                            e.stopPropagation();
                            moveToToday(item.id);
                          }}
                        >
                          Today
                        </button>
                        <button
                          type="button"
                          className="kill"
                          aria-label={`Delete ${title}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            dispatch({ type: 'item/delete', id: item.id });
                          }}
                        />
                        <button
                          type="button"
                          className="checkbox"
                          data-checked={false}
                          aria-label={`Mark ${title} as done`}
                          onClick={(e) => {
                            e.stopPropagation();
                            dispatch({ type: 'item/toggle', id: item.id });
                          }}
                        />
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        {missed.length > 0 && (
          <p className="missed__note">
            Done items never count as missed. Tick one off, or move it to today, and it
            leaves this page.
          </p>
        )}
      </div>
    </div>
  );
}
