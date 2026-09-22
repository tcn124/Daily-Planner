import { useState } from 'react';
import { createPortal } from 'react-dom';
import { usePlanner } from '../store/plannerStore';
import { subjectChipBg, subjectChipInk } from '../lib/color';
import {
  addDays,
  dayName,
  daysBetween,
  dayOfMonth,
  isWithin,
  monthLong,
  monthShort,
  todayISO,
} from '../lib/dates';
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

function Chevron() {
  return (
    <svg viewBox="0 0 30 30" width="12" height="12" fill="none" aria-hidden="true">
      <path
        d="M9.83287 15.0052C9.83702 14.8599 9.86607 14.7271 9.92003 14.6067C9.97398 14.4864 10.057 14.3702 10.1691 14.2581L16.4071 8.21929C16.5856 8.04082 16.8055 7.95159 17.067 7.95159C17.2413 7.95159 17.399 7.99309 17.5401 8.0761C17.6854 8.15911 17.7995 8.27117 17.8826 8.41228C17.9697 8.5534 18.0133 8.71111 18.0133 8.88543C18.0133 9.14275 17.9158 9.36895 17.7207 9.56402L12.0803 14.999L17.7207 20.4401C17.9158 20.6393 18.0133 20.8655 18.0133 21.1187C18.0133 21.2972 17.9697 21.457 17.8826 21.5981C17.7995 21.7392 17.6854 21.8512 17.5401 21.9343C17.399 22.0214 17.2413 22.065 17.067 22.065C16.8055 22.065 16.5856 21.9737 16.4071 21.7911L10.1691 15.7522C10.0528 15.6402 9.96776 15.524 9.9138 15.4036C9.85985 15.2791 9.83287 15.1463 9.83287 15.0052Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function DayPage({ date, slot, onClose, onNavigate }: Props) {
  const { state, dispatch } = usePlanner();
  const { subjects, items, recurring, notes } = state;
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);

  const today = todayISO();
  const dayItems = items
    .filter((i) => i.date === date)
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'assignment' ? -1 : 1;
      return a.createdAt - b.createdAt;
    });
  const dayRecurring = recurring.filter((r) => isWithin(date, r.startDate, r.endDate));

  const subject = (id: string | null) => subjects.find((s) => s.id === id) ?? null;

  const assignments = dayItems.filter((i) => i.type === 'assignment').length;
  const events = dayItems.filter((i) => i.type === 'event').length;
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
      <div className="viewbar viewbar--crumb">
        <div className="viewbar__lead" />
        <div className="viewbar__center">
          <button type="button" className="daypage__crumb" onClick={onClose}>
            Week
          </button>
          <span aria-hidden="true">/</span>
          <span className="daypage__crumb-current">
            {dayName(date).slice(0, 3)}, {monthShort(date)} {dayOfMonth(date)}
          </span>
        </div>
        <span className="viewbar__actions daypage__bar-nav">
          <button type="button" aria-label="Previous day"
            onClick={() => onNavigate(addDays(date, -1))}>
            <Chevron />
          </button>
          <button type="button" className="daypage__next" aria-label="Next day"
            onClick={() => onNavigate(addDays(date, 1))}>
            <Chevron />
          </button>
        </span>
      </div>,
        slot,
      )}

      <div className="daypage__body">
        <div className="daypage__heading">
          <span className="daypage__eyebrow">
            {dayName(date)}
            {date === today && ' · today'}
          </span>
          <h1 className="daypage__title">
            {monthLong(date)} {dayOfMonth(date)}
          </h1>
        </div>

        <div className="daypage__meta">
          <div className="daypage__meta-row">
            <span className="daypage__meta-key">Due today</span>
            <span>
              {assignments} assignment{assignments === 1 ? '' : 's'} · {events} event
              {events === 1 ? '' : 's'}
            </span>
          </div>
          {usedSubjects.length > 0 && (
            <div className="daypage__meta-row">
              <span className="daypage__meta-key">Subjects</span>
              <span className="daypage__chips">
                {usedSubjects.map((s) => (
                  <span key={s.id} className="chip"
                    style={{ background: subjectChipBg(s.hue), color: subjectChipInk(s.hue) }}>
                    {s.name}
                  </span>
                ))}
              </span>
            </div>
          )}
          {dayRecurring.length > 0 && (
            <div className="daypage__meta-row">
              <span className="daypage__meta-key">Recurring</span>
              <span className="daypage__meta-soft daypage__meta-stack">
                {dayRecurring.map((r) => (
                  <span key={r.id}>
                    {r.title || 'Untitled'} · day {daysBetween(r.startDate, date) + 1} of{' '}
                    {daysBetween(r.startDate, r.endDate) + 1}
                  </span>
                ))}
              </span>
            </div>
          )}
        </div>

        <div className="daypage__rule" />

        <div className="daypage__items">
          {dayItems.map((item) => {
            const s = subject(item.subjectId);
            const isEditing = editing?.id === item.id;
            if (isEditing) {
              return (
                <ItemComposer
                  key={item.id}
                  subjects={subjects}
                  initial={item}
                  title="Edit item"
                  submitLabel="Save"
                  onSubmit={submit}
                  onCancel={() => setEditing(null)}
                  onCreateSubject={createSubject}
                />
              );
            }
            return (
              <div key={item.id}
                className={item.done ? 'daypage__item daypage__item--done' : 'daypage__item'}>
                <button type="button" className="checkbox" data-checked={item.done}
                  aria-label={item.done ? 'Mark as not done' : 'Mark as done'}
                  onClick={() => dispatch({ type: 'item/toggle', id: item.id })} />
                <button type="button" className="daypage__item-text"
                  onClick={() => { setComposing(false); setEditing(item); }}>
                  {item.description || 'Untitled'}
                </button>
                {item.time && <span className="daypage__item-time">{item.time}</span>}
                {s && (
                  <span className="chip daypage__item-chip"
                    style={{ background: subjectChipBg(s.hue), color: subjectChipInk(s.hue) }}>
                    {s.name}
                  </span>
                )}
                <button type="button" className="kill daypage__item-kill"
                  aria-label={`Delete ${item.description || 'item'}`}
                  onClick={() => dispatch({ type: 'item/delete', id: item.id })} />
              </div>
            );
          })}

          {composing ? (
            <ItemComposer
              subjects={subjects}
              title="New item"
              onSubmit={submit}
              onCancel={() => setComposing(false)}
              onCreateSubject={createSubject}
            />
          ) : (
            <button type="button" className="daypage__add"
              onClick={() => { setEditing(null); setComposing(true); }}>
              <span className="daypage__add-plus">+</span>Add an item to this day
            </button>
          )}
        </div>

        <label className="daypage__notes">
          <span className="sr-only">Notes for this day</span>
          <textarea
            className="daypage__notes-field"
            placeholder="Notes — free text for the day."
            value={notes[date] ?? ''}
            onChange={(e) => dispatch({ type: 'note/set', date, text: e.target.value })}
          />
        </label>
      </div>
    </div>
  );
}
