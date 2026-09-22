import { useEffect, useRef, useState } from 'react';
import type { ItemType, Subject } from '../types';
import { dayOfMonth, dayName, monthShort } from '../lib/dates';
import { formatTimeInput } from '../lib/time';
import { SubjectChips } from './SubjectChips';

export interface ComposerValue {
  subjectId: string | null;
  /** The title. */
  description: string;
  /** The specifics under it — pages, prompt, where to submit. */
  details: string;
  time: string;
  /** Which band the item belongs to — editable, so items can move between them. */
  type: ItemType;
}

interface Props {
  subjects: Subject[];
  initial?: Partial<ComposerValue>;
  /** Shown beside the title, e.g. "Tue, Aug 25". Omitted on surfaces that
   *  already state the date. */
  date?: string;
  title?: string;
  submitLabel?: string;
  onSubmit: (value: ComposerValue) => void;
  onCancel: () => void;
  onCreateSubject: (name: string, hue: number | null) => string;
}

const BAND_LABEL: Record<ItemType, string> = {
  assignment: 'Assignments',
  event: 'Events',
};

export function ItemComposer({
  subjects,
  initial,
  date,
  title = 'New item',
  submitLabel = 'Add item',
  onSubmit,
  onCancel,
  onCreateSubject,
}: Props) {
  const [subjectId, setSubjectId] = useState<string | null>(initial?.subjectId ?? null);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [details, setDetails] = useState(initial?.details ?? '');
  const [time, setTime] = useState(initial?.time ?? '');
  const [type, setType] = useState<ItemType>(initial?.type ?? 'assignment');
  const descRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    descRef.current?.focus();
  }, []);

  /**
   * A press anywhere outside the composer cancels it, so leaving an item is
   * a click away rather than a hunt for the Cancel button. It watches
   * mousedown, not click, so the press that opens another card or "+ Add"
   * closes this one first, and so a text selection that starts inside and is
   * released outside still counts as inside. The listener is added after
   * mount, so the press that opened the composer never reaches it.
   */
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const root = rootRef.current;
      if (root && e.target instanceof Node && !root.contains(e.target)) onCancel();
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onCancel]);

  function submit() {
    // Also formats here so ⌘↵ straight from the time field is not skipped.
    onSubmit({
      subjectId,
      description: description.trim(),
      details: details.trim(),
      time: formatTimeInput(time).trim(),
      type,
    });
  }

  return (
    <div
      ref={rootRef}
      className="composer"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onCancel();
        }
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          submit();
        }
      }}
    >
      <div className="composer__head">
        <span className="composer__title">{title}</span>
        {date && (
          <span className="composer__date">
            {dayName(date).slice(0, 3)}, {monthShort(date)} {dayOfMonth(date)}
          </span>
        )}
        <button
          type="button"
          className="kill composer__close"
          aria-label="Cancel"
          onClick={onCancel}
        />
      </div>

      <div className="composer__field">
        <span className="composer__label">Subject</span>
        <SubjectChips
          subjects={subjects}
          value={subjectId}
          onChange={setSubjectId}
          onCreate={onCreateSubject}
        />
      </div>

      <div className="composer__field">
        <span className="composer__label">Title</span>
        <textarea
          ref={descRef}
          className="field composer__desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="composer__field">
        <span className="composer__label">Details</span>
        <textarea
          className="field composer__details"
          placeholder="Pages, prompt, where to submit…"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />
      </div>

      <div className="composer__row">
        <div className="composer__field">
          <span className="composer__label">Time</span>
          <input
            className="field"
            placeholder="11:59 pm"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            // Formatting while typing would turn "12" into "12:00" before the
            // "30" arrives, so it waits until the field is left.
            onBlur={() => setTime(formatTimeInput(time))}
          />
        </div>
        <div className="composer__field">
          <span className="composer__label">Band</span>
          <select
            className="field composer__band"
            value={type}
            onChange={(e) => setType(e.target.value as ItemType)}
          >
            {(Object.keys(BAND_LABEL) as ItemType[]).map((t) => (
              <option key={t} value={t}>
                {BAND_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="composer__actions">
        <button type="button" className="btn btn--primary" onClick={submit}>
          {submitLabel}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <span className="composer__hint" aria-hidden="true">
          ⌘↵
        </span>
      </div>
    </div>
  );
}
