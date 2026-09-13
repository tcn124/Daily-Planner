import { useEffect, useRef, useState } from 'react';
import type { Subject } from '../types';
import { SubjectSelect } from './SubjectSelect';

export interface ComposerValue {
  subjectId: string | null;
  description: string;
  time: string;
}

interface Props {
  subjects: Subject[];
  initial?: Partial<ComposerValue>;
  title?: string;
  submitLabel?: string;
  onSubmit: (value: ComposerValue) => void;
  onCancel: () => void;
  onCreateSubject: (name: string, hue: number | null) => string;
}

export function ItemComposer({
  subjects,
  initial,
  title = 'Add item',
  submitLabel = 'Add',
  onSubmit,
  onCancel,
  onCreateSubject,
}: Props) {
  const [subjectId, setSubjectId] = useState<string | null>(initial?.subjectId ?? null);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [time, setTime] = useState(initial?.time ?? '');
  const descRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    descRef.current?.focus();
  }, []);

  function submit() {
    onSubmit({ subjectId, description: description.trim(), time: time.trim() });
  }

  return (
    <div
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
      <div className="composer__title">{title}</div>

      <SubjectSelect
        subjects={subjects}
        value={subjectId}
        onChange={setSubjectId}
        onCreate={onCreateSubject}
      />

      <textarea
        ref={descRef}
        className="field composer__desc"
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <input
        className="field composer__time"
        placeholder="Time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
      />

      <div className="composer__actions">
        <button type="button" className="btn btn--primary" onClick={submit}>
          {submitLabel}
        </button>
        <button
          type="button"
          className="btn btn--icon"
          aria-label="Cancel"
          onClick={onCancel}
        >
          <span className="kill" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
