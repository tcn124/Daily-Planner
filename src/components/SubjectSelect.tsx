import { useEffect, useRef, useState } from 'react';
import type { Subject } from '../types';
import { DEFAULT_HUE } from '../store/defaults';
import { subjectLabel } from '../lib/color';
import { HuePicker } from './HuePicker';

interface Props {
  subjects: Subject[];
  value: string | null;
  onChange: (subjectId: string | null) => void;
  onCreate: (name: string, hue: number | null) => string;
  /** Rendered when nothing is selected. */
  placeholder?: string;
}

export function SubjectSelect({
  subjects,
  value,
  onChange,
  onCreate,
  placeholder = 'Subject',
}: Props) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [hue, setHue] = useState<number>(DEFAULT_HUE);
  const rootRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const selected = subjects.find((s) => s.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (creating) nameRef.current?.focus();
  }, [creating]);

  function commitNew() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onChange(onCreate(trimmed, hue));
    setName('');
    setHue(DEFAULT_HUE);
    setCreating(false);
    setOpen(false);
  }

  return (
    <div className="subject-select" ref={rootRef}>
      <button
        type="button"
        className="subject-select__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span
          className={
            selected
              ? 'subject-select__label'
              : 'subject-select__label subject-select__label--empty'
          }
        >
          {selected ? selected.name : placeholder}
        </span>
        <span className="subject-select__chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className="subject-select__menu" role="listbox">
          <button
            type="button"
            className="subject-select__option"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            <span className="swatch" style={{ background: subjectLabel(null) }} />
            <span>No subject</span>
          </button>

          {subjects.map((s) => (
            <button
              key={s.id}
              type="button"
              className="subject-select__option"
              onClick={() => {
                onChange(s.id);
                setOpen(false);
              }}
            >
              <span
                className="swatch"
                style={{ background: subjectLabel(s.hue) }}
              />
              <span>{s.name}</span>
            </button>
          ))}

          {!creating ? (
            <button
              type="button"
              className="subject-select__option subject-select__option--new"
              onClick={() => setCreating(true)}
            >
              <span aria-hidden="true">+</span>
              <span>New subject…</span>
            </button>
          ) : (
            <div className="subject-new">
              <input
                ref={nameRef}
                className="field subject-new__name"
                placeholder="Subject name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitNew();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setCreating(false);
                  }
                }}
              />
              <HuePicker hue={hue} onChange={setHue} />
              <div className="subject-new__actions">
                <button type="button" className="btn btn--primary" onClick={commitNew}>
                  Create
                </button>
                <button type="button" className="btn" onClick={() => setCreating(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
