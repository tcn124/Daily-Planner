import { useEffect, useRef, useState } from 'react';
import type { Subject } from '../types';
import { DEFAULT_HUE } from '../store/defaults';
import { SubjectSquare } from './SubjectSquare';

interface Props {
  subjects: Subject[];
  value: string | null;
  onChange: (id: string | null) => void;
  onCreate: (name: string, hue: number | null) => string;
}

/**
 * The design picks a subject from a wrapped row of pills rather than a
 * dropdown: grey pills carrying the subject's colour square, the chosen one
 * filled in ink. "+ New" opens an inline name field so creating a named
 * subject mid-compose still works. Shared by the desktop composer and the
 * phone's composer sheet, which sizes it up for touch.
 */
export function SubjectChips({ subjects, value, onChange, onCreate }: Props) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  function commit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = onCreate(trimmed, (DEFAULT_HUE + subjects.length * 47) % 360);
    onChange(id);
    setName('');
    setCreating(false);
  }

  return (
    <div className="chips">
      <button
        type="button"
        className="chip chips__option chips__option--none"
        data-selected={value === null}
        aria-pressed={value === null}
        onClick={() => onChange(null)}
      >
        None
      </button>

      {subjects.map((s) => (
        <button
          key={s.id}
          type="button"
          className="chip chips__option"
          data-selected={value === s.id}
          aria-pressed={value === s.id}
          onClick={() => onChange(s.id)}
        >
          <SubjectSquare hue={s.hue} size={7} />
          {s.name}
        </button>
      ))}

      {creating ? (
        <input
          ref={inputRef}
          className="chips__new-field"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
            if (e.key === 'Escape') {
              e.stopPropagation();
              setName('');
              setCreating(false);
            }
          }}
          onBlur={() => {
            if (!name.trim()) setCreating(false);
          }}
        />
      ) : (
        <button
          type="button"
          className="chip chips__new link link--muted"
          onClick={() => setCreating(true)}
        >
          + New
        </button>
      )}
    </div>
  );
}
