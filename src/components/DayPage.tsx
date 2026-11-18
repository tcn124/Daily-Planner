import { useState } from 'react';
import { createPortal } from 'react-dom';
import { usePlanner } from '../store/plannerStore';
import {
  addDays,
  dayName,
  dayOfMonth,
  isWithin,
  isoWeek,
  monthShort,
  todayISO,
} from '../lib/dates';
import { compactTime, pad2 } from '../lib/format';
import { recurringProgress } from '../lib/recurring';
import { SubjectSquare } from './SubjectSquare';
import { ChevronLeft, ChevronRight } from './icons';
import { uid } from '../store/defaults';
import { ItemComposer, type ComposerValue } from './ItemComposer';
import type { Item } from '../types';

interface Props {
  date: string;
  /** The top bar's content slot; the breadcrumb and day nav render into it. */
  slot: HTMLElement | null;
  onClose: () => void;
  onNavigate: (date: string) => void;
}

export function DayPage({ date, slot, onClose, onNavigate }: Props) {
  const { state, dispatch } = usePlanner();
  const { subjects, items, recurring, notes } = state;
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);

  const today = todayISO();
  const dayItems = items
    .filter((i) => i.date === date)
    .sort((a, b) => a.createdAt - b.createdAt);
  const dayRecurring = recurring.filter((r) => isWithin(date, r.startDate, r.endDate));

  const subject = (id: string | null) => subjects.find((s) => s.id === id) ?? null;

  const open = dayItems.filter((i) => !i.done).length;
  const usedSubjects = subjects.filter((s) =>
    dayItems.some((i) => i.subjectId === s.id),
  );

  function createSubject(name: string, hue: number | null): string {
    const id = uid();
    dispatch({ type: 'subject/add', name, hue, id });
    return id;
  }

  function submit(value: ComposerValue) {
    if (editing) {
      dispatch({ type: 'item/update', id: editing.id, patch: value });
    } else {
      dispatch({ type: 'item/add', item: { date, done: false, ...value } });
    }
    setComposing(false);
    setEditing(null);
  }

  return (
    <div className="daypage">
      {slot && createPortal(
      <div className="viewbar">
        <div className="viewbar__lead">
          <h1 className="viewbar__title">{dayName(date)}.</h1>
          <div className="viewbar__eyebrow">
            <span className="viewbar__eyebrow-soft">
              {monthShort(date)} {dayOfMonth(date)} · Week {isoWeek(date)}
            </span>
            {date === today ? (
              <span className="viewbar__eyebrow-accent">Today</span>
            ) : (
              <span>{date < today ? 'Past' : 'Ahead'}</span>
            )}
          </div>
        </div>
        <div className="viewbar__actions">
          <button type="button" className="link" onClick={onClose}>
            ← Back to week
          </button>
          <div className="navgroup">
            <button type="button" className="navgroup__arrow" aria-label="Previous day"
              onClick={() => onNavigate(addDays(date, -1))}>
              <ChevronLeft />
            </button>
            <button type="button" className="navgroup__arrow" aria-label="Next day"
              onClick={() => onNavigate(addDays(date, 1))}>
              <ChevronRight />
            </button>
          </div>
        </div>
      </div>,
        slot,
      )}

      <div className="daypage__body">
        <div className="daypage__meta">
          <div className="daypage__meta-row">
            <span className="daypage__meta-key">Due</span>
            <span>
              {open} open{dayItems.length > open ? ` · ${dayItems.length - open} done` : ''}
            </span>
          </div>
          {usedSubjects.length > 0 && (
            <div className="daypage__meta-row">
              <span className="daypage__meta-key">Subjects</span>
              <span className="daypage__chips">
                {usedSubjects.map((s) => (
                  <span key={s.id} className="chip">
                    <SubjectSquare hue={s.hue} size={7} />
                    {s.name}
                  </span>
                ))}
              </span>
            </div>
          )}
          {dayRecurring.length > 0 && (
            <div className="daypage__meta-row">
              <span className="daypage__meta-key">Recurring</span>
              <span className="daypage__meta-stack">
                {dayRecurring.map((r) => {
                  const p = recurringProgress(r, date);
                  const ticked = r.doneDates.includes(date);
                  return (
                    <span key={r.id} className="daypage__rec" data-done={ticked}>
                      <button type="button" className="checkbox" data-checked={ticked}
                        aria-label={ticked ? `Clear ${r.title || 'this'} for today` : `Mark ${r.title || 'this'} done for today`}
                        onClick={() => dispatch({ type: 'recurring/toggleDay', id: r.id, date })} />
                      <span>
                        {r.title || 'Untitled'} · day {p.dayIndex} of {p.total}
                      </span>
                    </span>
                  );
                })}
              </span>
            </div>
          )}
        </div>

        <h2 className="daypage__head">
          Items<span className="count">{pad2(dayItems.length)}</span>
        </h2>

        <div className="daypage__items">
          {dayItems.map((item) => {
            const s = subject(item.subjectId);
            const isEditing = editing?.id === item.id;
            if (isEditing) {
              return (
                <div key={item.id} className="daypage__composer">
                  <ItemComposer
                    subjects={subjects}
                    initial={item}
                    title="Edit item"
                    submitLabel="Save"
                    onSubmit={submit}
                    onCancel={() => setEditing(null)}
                    onCreateSubject={createSubject}
                  />
                </div>
              );
            }
            return (
              <div key={item.id}
                className={item.done ? 'daypage__item daypage__item--done' : 'daypage__item'}>
                <span className="daypage__item-subject">
                  <SubjectSquare hue={s?.hue ?? null} dim={item.done} />
                  <span>{s?.name ?? 'No subject'}</span>
                </span>
                <span className="daypage__item-body">
                  <button type="button" className="daypage__item-text"
                    onClick={() => { setComposing(false); setEditing(item); }}>
                    {item.description || 'Untitled'}
                  </button>
                  {item.details && (
                    <span className="daypage__item-details" title={item.details}>
                      {item.details}
                    </span>
                  )}
                </span>
                <span className="daypage__item-time">{compactTime(item.time)}</span>
                <span className="daypage__item-actions">
                  <button type="button" className="kill"
                    aria-label={`Delete ${item.description || 'item'}`}
                    onClick={() => dispatch({ type: 'item/delete', id: item.id })} />
                  <button type="button" className="checkbox" data-checked={item.done}
                    aria-label={item.done ? 'Mark as not done' : 'Mark as done'}
                    onClick={() => dispatch({ type: 'item/toggle', id: item.id })} />
                </span>
              </div>
            );
          })}

          {composing ? (
            <div className="daypage__composer">
              <ItemComposer
                subjects={subjects}
                title="New item"
                onSubmit={submit}
                onCancel={() => setComposing(false)}
                onCreateSubject={createSubject}
              />
            </div>
          ) : (
            <button type="button" className="daypage__add"
              onClick={() => { setEditing(null); setComposing(true); }}>
              + Add an item to this day
            </button>
          )}
        </div>

        <label className="daypage__notes">
          <span className="daypage__head">Notes</span>
          <textarea
            className="daypage__notes-field"
            placeholder="Free text for the day."
            value={notes[date]?.text ?? ''}
            onChange={(e) => dispatch({ type: 'note/set', date, text: e.target.value })}
          />
        </label>
      </div>
    </div>
  );
}
