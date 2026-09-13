import { useEffect, useRef, useState } from 'react';
import type { RecurringItem, Subject } from '../types';
import { addDays, daysBetween } from '../lib/dates';
import { RecurringBar } from './RecurringBar';
import { SubjectSelect } from './SubjectSelect';

const ROW_H = 44;

interface Props {
  anchorDate: string;
  days: number;
  recurring: RecurringItem[];
  subjects: Subject[];
  onCreate: (item: Omit<RecurringItem, 'id'>) => void;
  onUpdate: (id: string, patch: Partial<RecurringItem>) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
  onCreateSubject: (name: string, hue: number | null) => string;
}

interface Placed {
  item: RecurringItem;
  startIndex: number;
  span: number;
  row: number;
}

interface EditorState {
  /** null while creating a brand-new bar. */
  id: string | null;
  startIndex: number;
  endIndex: number;
  row: number;
  subjectId: string | null;
  title: string;
}

type Drag =
  | { mode: 'create'; anchorIndex: number; currentIndex: number }
  /** `fixedIndex` is the edge that stays put — the opposite one follows the cursor. */
  | { mode: 'resize'; id: string; fixedIndex: number };

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

/**
 * Greedy row packing — a bar drops into the first row where it doesn't
 * collide with anything already placed there.
 */
function packRows(
  spans: { item: RecurringItem; startIndex: number; span: number }[],
): Placed[] {
  const rows: { start: number; end: number }[][] = [];
  return spans
    .slice()
    .sort((a, b) => a.startIndex - b.startIndex)
    .map((s) => {
      const end = s.startIndex + s.span - 1;
      let row = rows.findIndex(
        (occupants) =>
          !occupants.some((o) => s.startIndex <= o.end && end >= o.start),
      );
      if (row === -1) {
        row = rows.length;
        rows.push([]);
      }
      rows[row].push({ start: s.startIndex, end });
      return { ...s, row };
    });
}

export function RecurringBand({
  anchorDate,
  days,
  recurring,
  subjects,
  onCreate,
  onUpdate,
  onDelete,
  onToggle,
  onCreateSubject,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);

  // Bars that overlap the visible window, clamped to it.
  const visible = recurring
    .map((item) => {
      const rawStart = daysBetween(anchorDate, item.startDate);
      const rawEnd = daysBetween(anchorDate, item.endDate);
      if (rawEnd < 0 || rawStart > days - 1) return null;
      const startIndex = clamp(rawStart, 0, days - 1);
      const endIndex = clamp(rawEnd, 0, days - 1);
      return { item, startIndex, span: endIndex - startIndex + 1 };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  const placed = packRows(visible);
  const nextFreeRow = placed.length
    ? Math.max(...placed.map((p) => p.row)) + 1
    : 0;

  function indexFromClientX(clientX: number): number {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return clamp(
      Math.floor(((clientX - rect.left) / rect.width) * days),
      0,
      days - 1,
    );
  }

  // Drag lives on the window so the pointer can leave the track mid-gesture.
  useEffect(() => {
    if (!drag) return;
    // Capture the narrowed value so the discriminant survives into the handlers.
    const active = drag;

    function onMove(e: globalThis.MouseEvent) {
      const index = indexFromClientX(e.clientX);
      if (active.mode === 'create') {
        setDrag({ ...active, currentIndex: index });
      } else {
        const { id, fixedIndex } = active;
        const lo = Math.min(index, fixedIndex);
        const hi = Math.max(index, fixedIndex);
        onUpdate(id, {
          startDate: addDays(anchorDate, lo),
          endDate: addDays(anchorDate, hi),
        });
      }
    }

    function onUp(e: globalThis.MouseEvent) {
      if (active.mode === 'create') {
        const index = indexFromClientX(e.clientX);
        setEditor({
          id: null,
          startIndex: Math.min(active.anchorIndex, index),
          endIndex: Math.max(active.anchorIndex, index),
          row: nextFreeRow,
          subjectId: null,
          title: '',
        });
      }
      setDrag(null);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, anchorDate, days, nextFreeRow]);

  function commitEditor() {
    if (!editor) return;
    const payload = {
      subjectId: editor.subjectId,
      title: editor.title.trim(),
      startDate: addDays(anchorDate, editor.startIndex),
      endDate: addDays(anchorDate, editor.endIndex),
    };
    if (editor.id) {
      onUpdate(editor.id, payload);
    } else {
      onCreate({ ...payload, done: false });
    }
    setEditor(null);
  }

  const preview =
    drag?.mode === 'create'
      ? {
          start: Math.min(drag.anchorIndex, drag.currentIndex),
          span: Math.abs(drag.currentIndex - drag.anchorIndex) + 1,
        }
      : null;

  const geometry = (startIndex: number, span: number) => ({
    left: `calc(${(startIndex / days) * 100}% + 4px)`,
    width: `calc(${(span / days) * 100}% - 8px)`,
  });

  return (
    <div
      className="rec-track"
      ref={trackRef}
      onMouseDown={(e) => {
        // Only start a new bar when the gesture begins on empty track.
        if (e.target !== e.currentTarget) return;
        if (editor) {
          setEditor(null);
          return;
        }
        const index = indexFromClientX(e.clientX);
        setDrag({ mode: 'create', anchorIndex: index, currentIndex: index });
      }}
    >
      <div className="rec-track__grid" aria-hidden="true">
        {Array.from({ length: days }, (_, i) => (
          <span key={i} />
        ))}
      </div>

      {placed.map(({ item, startIndex, span, row }) => (
        <RecurringBar
          key={item.id}
          item={item}
          subject={subjects.find((s) => s.id === item.subjectId) ?? null}
          leftFrac={startIndex / days}
          widthFrac={span / days}
          row={row}
          onToggle={() => onToggle(item.id)}
          onDelete={() => onDelete(item.id)}
          onEdit={() =>
            setEditor({
              id: item.id,
              startIndex,
              endIndex: startIndex + span - 1,
              row,
              subjectId: item.subjectId,
              title: item.title,
            })
          }
          onResizeStart={(edge) =>
            setDrag({
              mode: 'resize',
              id: item.id,
              fixedIndex: edge === 'start' ? startIndex + span - 1 : startIndex,
            })
          }
        />
      ))}

      {preview && (
        <div
          className="rec-preview"
          style={{
            ...geometry(preview.start, preview.span),
            top: 6 + nextFreeRow * ROW_H,
          }}
        />
      )}

      {editor && (
        <div
          className="rec-editor"
          style={{
            ...geometry(editor.startIndex, editor.endIndex - editor.startIndex + 1),
            top: 6 + editor.row * ROW_H,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditor(null);
            if (e.key === 'Enter') {
              e.preventDefault();
              commitEditor();
            }
          }}
        >
          <div className="rec-editor__subject">
            <SubjectSelect
              subjects={subjects}
              value={editor.subjectId}
              onChange={(subjectId) => setEditor({ ...editor, subjectId })}
              onCreate={onCreateSubject}
            />
          </div>
          <input
            className="field rec-editor__title"
            placeholder="What is it?"
            autoFocus
            value={editor.title}
            onChange={(e) => setEditor({ ...editor, title: e.target.value })}
          />
          <button type="button" className="btn btn--primary" onClick={commitEditor}>
            {editor.id ? 'Save' : 'Add'}
          </button>
          <button
            type="button"
            className="btn btn--icon"
            aria-label="Cancel"
            onClick={() => setEditor(null)}
          >
            <span className="kill" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
