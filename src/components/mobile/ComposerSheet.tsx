import { useEffect, useRef, useState } from 'react';
import { usePlanner } from '../../store/plannerStore';
import { uid } from '../../store/defaults';
import { SubjectChips } from '../SubjectChips';
import { Sheet, SheetField } from './Sheet';
import type { BandChoice, ComposeTarget } from './sheets';
import { formatTimeInput } from '../../lib/time';
import { addDays, shortDate } from '../../lib/dates';
import type { ItemType } from '../../types';

interface Props {
  target: ComposeTarget;
  onClose: () => void;
}

const BANDS: { id: BandChoice; label: string }[] = [
  { id: 'assignment', label: 'Assignment' },
  { id: 'event', label: 'Event' },
  { id: 'recurring', label: 'Recurring' },
];

/**
 * The desktop's popover composer, as a sheet.
 *
 * Two changes the phone forces. Band comes first rather than last: it decides
 * whether the rest of the form asks for one date or two, and a question that
 * rearranges the fields below it cannot sit underneath them. And Add is in the
 * sheet header, because the keyboard covers the bottom third of the screen —
 * the one place a form's submit button would normally go.
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

  const [band, setBand] = useState<BandChoice>(
    target.mode === 'new'
      ? target.band
      : editingSpan
        ? 'recurring'
        : (editingItem?.type ?? 'assignment'),
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

  const titleRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    // A composer is opened to type in, so this one field does take focus.
    titleRef.current?.focus();
  }, []);

  // A record already exists as one kind or the other; changing which would be a
  // delete and an add wearing the same button. Assignment and Event are the
  // same record with a different `type`, so those two stay interchangeable.
  const bands = editingSpan ? BANDS.slice(2) : target.mode === 'edit' ? BANDS.slice(0, 2) : BANDS;

  function createSubject(name: string, hue: number | null): string {
    const id = uid();
    dispatch({ type: 'subject/add', name, hue, id });
    return id;
  }

  function submit() {
    const trimmed = title.trim();

    if (band === 'recurring') {
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
        type: band as ItemType,
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

  const recurringBand = band === 'recurring';

  return (
    <Sheet
      title={target.mode === 'edit' ? 'Edit' : 'New'}
      subtitle={recurringBand ? undefined : shortDate(date)}
      closeLabel="Cancel"
      action={{ label: target.mode === 'edit' ? 'Save' : 'Add', onClick: submit }}
      onClose={onClose}
    >
      <div className="m-form">
        <SheetField label="Band">
          <div className="m-seg m-seg--form" role="group" aria-label="Band">
            {bands.map((b) => (
              <button
                key={b.id}
                type="button"
                className="m-seg__opt"
                data-active={band === b.id}
                aria-pressed={band === b.id}
                onClick={() => setBand(b.id)}
              >
                {b.label}
              </button>
            ))}
          </div>
        </SheetField>

        <SheetField label="Subject">
          <SubjectChips
            subjects={subjects}
            value={subjectId}
            onChange={setSubjectId}
            onCreate={createSubject}
          />
        </SheetField>

        <SheetField label="Title">
          <textarea
            ref={titleRef}
            className="m-input m-input--title"
            rows={2}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </SheetField>

        {/* Recurring items carry no details or time — they are a span with a
            name, ticked off a day at a time. */}
        {!recurringBand && (
          <SheetField label="Details">
            <textarea
              className="m-input"
              rows={3}
              placeholder="Pages, prompt, where to submit…"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
          </SheetField>
        )}

        <div className="m-form__row">
          <SheetField label={recurringBand ? 'Starts' : 'Date'}>
            <input
              type="date"
              className="m-input"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
          </SheetField>
          {recurringBand ? (
            <SheetField label="Ends">
              <input
                type="date"
                className="m-input"
                value={endDate}
                min={date}
                onChange={(e) => e.target.value && setEndDate(e.target.value)}
              />
            </SheetField>
          ) : (
            <SheetField label="Time">
              <input
                className="m-input"
                placeholder="11:59 pm"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                // Formatting as you type would turn "12" into "12:00" before
                // the "30" arrives, so it waits until the field is left.
                onBlur={() => setTime(formatTimeInput(time))}
              />
            </SheetField>
          )}
        </div>
      </div>
    </Sheet>
  );
}
