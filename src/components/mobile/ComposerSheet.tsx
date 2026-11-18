import { useEffect, useRef, useState } from 'react';
import { usePlanner } from '../../store/plannerStore';
import { uid } from '../../store/defaults';
import { SubjectChips } from '../SubjectChips';
import { Sheet } from './Sheet';
import { DayStrip } from './DayStrip';
import type { ComposeTarget } from './sheets';
import { formatTimeInput } from '../../lib/time';
import { addDays, dayName, dayOfMonth, daysBetween, shortDate } from '../../lib/dates';

interface Props {
  target: ComposeTarget;
  onClose: () => void;
}

type Kind = 'assignment' | 'recurring';

/** Quick times beside the Time field (frame 5a). */
const QUICK_TIMES = [
  { label: '9 am', value: '9:00 am' },
  { label: 'Noon', value: '12:00 pm' },
];

/** "Mon 12 – Fri 16 · 5 days" — the Runs label for a span being picked. */
function runsLabel(start: string, end: string): string {
  const days = daysBetween(start, end) + 1;
  const day = (d: string) => `${dayName(d).slice(0, 3)} ${dayOfMonth(d)}`;
  return `${start === end ? day(start) : `${day(start)} – ${day(end)}`} · ${days} day${days === 1 ? '' : 's'}`;
}

/**
 * New and edit, for both kinds of record (frames 5a, 5b, 5e).
 *
 * The kind comes first because it decides whether the rest of the form asks
 * for one day or a span. Days are picked on the same week strip the header
 * uses, so choosing a date feels the same everywhere; "Other date…" reaches
 * anything outside that week.
 *
 * There is no Event choice: the redesign has one kind of dated item. An item
 * that was stored as an event keeps that type when it is edited here.
 */
export function ComposerSheet({ target, onClose }: Props) {
  const { state, dispatch } = usePlanner();
  const { subjects, items, recurring } = state;

  const editingItem =
    target.mode === 'edit' && target.kind === 'item'
      ? items.find((i) => i.id === target.id)
      : undefined;
  const editingSpan =
    target.mode === 'edit' && target.kind === 'recurring'
      ? recurring.find((r) => r.id === target.id)
      : undefined;

  const [kind, setKind] = useState<Kind>(
    target.mode === 'new'
      ? target.band === 'recurring'
        ? 'recurring'
        : 'assignment'
      : editingSpan
        ? 'recurring'
        : 'assignment',
  );
  const [subjectId, setSubjectId] = useState<string | null>(
    (editingItem ?? editingSpan)?.subjectId ?? null,
  );
  const [title, setTitle] = useState(editingItem?.description ?? editingSpan?.title ?? '');
  const [details, setDetails] = useState(editingItem?.details ?? '');
  const [time, setTime] = useState(editingItem?.time ?? '');
  const [date, setDate] = useState(
    target.mode === 'new' ? target.date : (editingItem?.date ?? editingSpan?.startDate ?? ''),
  );
  const [endDate, setEndDate] = useState(
    editingSpan?.endDate ?? addDays(target.mode === 'new' ? target.date : date, 4),
  );
  /** A span is picked as two taps: the start, then the end. */
  const [picking, setPicking] = useState<'start' | 'end'>('start');

  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // A composer is opened to type in, so this one field does take focus.
    titleRef.current?.focus();
  }, []);

  // A record already exists as one kind or the other; changing which would be
  // a delete and an add wearing the same button.
  const canSwitch = target.mode === 'new';

  function createSubject(name: string, hue: number | null): string {
    const id = uid();
    dispatch({ type: 'subject/add', name, hue, id });
    return id;
  }

  function pickRange(d: string) {
    if (picking === 'start') {
      setDate(d);
      setEndDate(d);
      setPicking('end');
      return;
    }
    // An end before the start restarts the span from there.
    if (d < date) {
      setDate(d);
      setEndDate(d);
      return;
    }
    setEndDate(d);
    setPicking('start');
  }

  function submit() {
    const trimmed = title.trim();

    if (kind === 'recurring') {
      const patch = {
        subjectId,
        title: trimmed,
        startDate: date,
        // A dragged-back end is taken as a one-day span rather than an error.
        endDate: endDate < date ? date : endDate,
      };
      if (editingSpan) dispatch({ type: 'recurring/update', id: editingSpan.id, patch });
      else dispatch({ type: 'recurring/add', item: { ...patch, doneDates: [] } });
    } else {
      const patch = {
        type: editingItem?.type ?? ('assignment' as const),
        subjectId,
        description: trimmed,
        details: details.trim(),
        // Formatted here too, so submitting straight from the time field is
        // not skipped the way leaving it would have formatted it.
        time: formatTimeInput(time).trim(),
        date,
      };
      if (editingItem) dispatch({ type: 'item/update', id: editingItem.id, patch });
      else dispatch({ type: 'item/add', item: { ...patch, done: false } });
    }
    onClose();
  }

  const isRecurring = kind === 'recurring';
  const editing = target.mode === 'edit';

  return (
    <Sheet
      title={editing ? 'Edit item' : 'New item'}
      subtitle={isRecurring ? 'Recurring' : shortDate(date)}
      action={{
        label: editing ? 'Save' : isRecurring ? 'Add recurring' : 'Add item',
        onClick: submit,
      }}
      onClose={onClose}
    >
      <div className="m-form">
        {canSwitch && (
          <div className="m-seg m-seg--form" role="group" aria-label="Kind">
            {(['assignment', 'recurring'] as Kind[]).map((k) => (
              <button
                key={k}
                type="button"
                className="m-seg__opt"
                data-active={kind === k}
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
              >
                {k === 'assignment' ? 'Assignment' : 'Recurring'}
              </button>
            ))}
          </div>
        )}

        <span className="m-label">Subject</span>
        <div className="m-form__pad">
          <SubjectChips
            subjects={subjects}
            value={subjectId}
            onChange={setSubjectId}
            onCreate={createSubject}
          />
        </div>

        <label className="m-label" htmlFor="m-compose-title">Title</label>
        <div className="m-form__pad">
          <input
            id="m-compose-title"
            ref={titleRef}
            className="m-input m-input--title"
            value={title}
            enterKeyHint="done"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
          />
        </div>

        {/* Recurring items carry no details or time — they are a span with a
            name, ticked off a day at a time. */}
        {!isRecurring && (
          <>
            <label className="m-label" htmlFor="m-compose-details">Details</label>
            <div className="m-form__pad">
              <textarea
                id="m-compose-details"
                className="m-input m-input--area"
                rows={3}
                placeholder="Pages, prompt, where to submit…"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />
            </div>
          </>
        )}

        {isRecurring ? (
          <>
            <span className="m-label">
              Runs <span className="m-label__note">{runsLabel(date, endDate)}</span>
            </span>
            <DayStrip
              weekOf={date}
              selected={date === endDate ? [date] : [date, endDate]}
              range={{ start: date, end: endDate }}
              onPick={pickRange}
              otherLabel="Longer than a week…"
              other={
                <div className="m-form__row">
                  <label className="m-field">
                    <span className="m-field__label">Starts</span>
                    <input
                      type="date"
                      className="m-input"
                      value={date}
                      onChange={(e) => e.target.value && setDate(e.target.value)}
                    />
                  </label>
                  <label className="m-field">
                    <span className="m-field__label">Ends</span>
                    <input
                      type="date"
                      className="m-input"
                      value={endDate}
                      min={date}
                      onChange={(e) => e.target.value && setEndDate(e.target.value)}
                    />
                  </label>
                </div>
              }
            />
            <p className="m-hint">
              {picking === 'end'
                ? 'Now tap the last day.'
                : 'Tap a start day, then an end day. Each day gets its own tick.'}
            </p>
          </>
        ) : (
          <>
            <span className="m-label">Due</span>
            <DayStrip weekOf={date} selected={[date]} onPick={setDate} />
            <div className="m-form__row m-form__pad">
              <label className="m-field">
                <span className="m-field__label">Time</span>
                <input
                  className="m-input"
                  placeholder="11:59 pm"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  // Formatting as you type would turn "12" into "12:00" before
                  // the "30" arrives, so it waits until the field is left.
                  onBlur={() => setTime(formatTimeInput(time))}
                />
              </label>
              <div className="m-field">
                <span className="m-field__label">Quick</span>
                <div className="m-quick">
                  {QUICK_TIMES.map((q) => (
                    <button
                      key={q.label}
                      type="button"
                      className="m-quick__opt"
                      data-active={time === q.value}
                      onClick={() => setTime(q.value)}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
