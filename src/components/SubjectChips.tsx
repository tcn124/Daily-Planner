import { useEffect, useRef, useState } from 'react';
import type { Subject } from '../types';
import { subjectAccent, subjectChipBg, subjectChipInk } from '../lib/color';
import { DEFAULT_HUE } from '../store/defaults';

interface Props {
  subjects: Subject[];
  value: string | null;
  onChange: (id: string | null) => void;
  onCreate: (name: string, hue: number | null) => string;
}

/**
 * The design picks a subject from a wrapped row of chips rather than a
 * dropdown. "+ New" opens an inline name field so creating a named subject
 * mid-compose still works.
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
          style={{
            background: subjectChipBg(s.hue),
            color: subjectChipInk(s.hue),
            // The selected chip gets a ring in its own accent colour.
            ...(value === s.id
              ? { boxShadow: `0 0 0 1.5px ${subjectAccent(s.hue)}` }
              : null),
          }}
          onClick={() => onChange(s.id)}
        >
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
          className="chip chips__new"
          onClick={() => setCreating(true)}
        >
          + New
        </button>
      )}
    </div>
  );
}
