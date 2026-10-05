import { useEffect, useRef, useState } from 'react';
import type { RecurringItem, Subject } from '../types';
import { addDays, daysBetween, isWeekend } from '../lib/dates';
import { ROW_H } from '../lib/recurring';
import { RecurringBar } from './RecurringBar';
import { SubjectChips } from './SubjectChips';

interface Props {
  anchorDate: string;
  days: number;
  recurring: RecurringItem[];
  subjects: Subject[];
  onCreate: (item: Omit<RecurringItem, 'id' | 'updatedAt'>) => void;
  onUpdate: (id: string, patch: Partial<RecurringItem>) => void;
  onDelete: (id: string) => void;
  onToggleDay: (id: string, date: string) => void;
  onCreateSubject: (name: string, hue: number | null) => string;
}

interface Span {
  item: RecurringItem;
  startIndex: number;
  span: number;
}

interface Placed extends Span {
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
  | { mode: 'resize'; id: string; fixedIndex: number; originIndex: number; moved: boolean }
  /** The whole bar follows the cursor, keeping its length. */
  | {
      mode: 'move';
      id: string;
      grabIndex: number;
      lastIndex: number;
      startDate: string;
      endDate: string;
      moved: boolean;
    };

const PROBE_ID = '__probe__';

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

/**
 * Greedy row packing — a bar drops into the first row where it doesn't
 * collide with anything already placed there.
 */
function packRows(spans: Span[]): Placed[] {
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
  onToggleDay,
  onCreateSubject,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  /**
   * A resize or move ends with mouseup on the bar, and the browser follows
   * that with a click — which would open the editor. This flags the click
   * that belongs to a drag so it can be ignored.
   */
  const swallowNextClick = useRef(false);

  // Bars that overlap the visible window, clamped to it.
  const visible: Span[] = recurring
    .map((item) => {
      const rawStart = daysBetween(anchorDate, item.startDate);
      const rawEnd = daysBetween(anchorDate, item.endDate);
      if (rawEnd < 0 || rawStart > days - 1) return null;
      const startIndex = clamp(rawStart, 0, days - 1);
      const endIndex = clamp(rawEnd, 0, days - 1);
      return { item, startIndex, span: endIndex - startIndex + 1 };
    })
    .filter((v): v is Span => v !== null);

  const placed = packRows(visible);

  /**
   * Where a bar over [startIndex, endIndex] will actually land once it exists,
   * found by packing it alongside everything already there. The preview and
   * the new-bar editor use this, so they sit exactly where the bar will —
   * not in a fresh row at the bottom that the real bar then jumps out of.
   */
  function rowFor(startIndex: number, endIndex: number): number {
    const probe: Span = {
      item: { id: PROBE_ID } as RecurringItem,
      startIndex,
      span: endIndex - startIndex + 1,
    };
    return packRows([...visible, probe]).find((p) => p.item.id === PROBE_ID)!.row;
  }

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
      } else if (active.mode === 'resize') {
        const lo = Math.min(index, active.fixedIndex);
        const hi = Math.max(index, active.fixedIndex);
        onUpdate(active.id, {
          startDate: addDays(anchorDate, lo),
          endDate: addDays(anchorDate, hi),
        });
        if (index !== active.originIndex && !active.moved) {
          setDrag({ ...active, moved: true });
        }
      } else {
        if (index === active.lastIndex) return;
        const delta = index - active.grabIndex;
        onUpdate(active.id, {
          startDate: addDays(active.startDate, delta),
          endDate: addDays(active.endDate, delta),
        });
        setDrag({ ...active, lastIndex: index, moved: true });
      }
    }

    function onUp(e: globalThis.MouseEvent) {
      if (active.mode === 'create') {
        const index = indexFromClientX(e.clientX);
        const lo = Math.min(active.anchorIndex, index);
        const hi = Math.max(active.anchorIndex, index);
        setEditor({
          id: null,
          startIndex: lo,
          endIndex: hi,
          row: rowFor(lo, hi),
          subjectId: null,
          title: '',
        });
      } else if (active.moved) {
        // The click that follows this mouseup is the tail of the drag.
        swallowNextClick.current = true;
        window.setTimeout(() => {
          swallowNextClick.current = false;
        }, 0);
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
  }, [drag, anchorDate, days]);

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
      onCreate({ ...payload, doneDates: [] });
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
          <span
            key={i}
            /* Carries the same weekend tint down from the day cells above,
               since this band has no per-day cells of its own to tint. */
            className={isWeekend(addDays(anchorDate, i)) ? 'rec-track__day--weekend' : undefined}
          />
        ))}
      </div>

      {placed.map(({ item, startIndex, span, row }) => (
        <RecurringBar
          key={item.id}
          item={item}
          subject={subjects.find((s) => s.id === item.subjectId) ?? null}
          dates={Array.from({ length: span }, (_, i) =>
            addDays(anchorDate, startIndex + i),
          )}
          leftFrac={startIndex / days}
          widthFrac={span / days}
          row={row}
          onToggleDay={(date) => onToggleDay(item.id, date)}
          onDelete={() => onDelete(item.id)}
          onEdit={() => {
            if (swallowNextClick.current) return;
            setEditor({
              id: item.id,
              startIndex,
              endIndex: startIndex + span - 1,
              row,
              subjectId: item.subjectId,
              title: item.title,
            });
          }}
          onResizeStart={(edge, e) => {
            const originIndex = indexFromClientX(e.clientX);
            setDrag({
              mode: 'resize',
              id: item.id,
              fixedIndex: edge === 'start' ? startIndex + span - 1 : startIndex,
              originIndex,
              moved: false,
            });
          }}
          onMoveStart={(e) => {
            e.preventDefault();
            const grabIndex = indexFromClientX(e.clientX);
            setDrag({
              mode: 'move',
              id: item.id,
              grabIndex,
              lastIndex: grabIndex,
              startDate: item.startDate,
              endDate: item.endDate,
              moved: false,
            });
          }}
        />
      ))}

      {preview && (
        <div
          className="rec-preview"
          style={{
            ...geometry(preview.start, preview.span),
            top: 6 + rowFor(preview.start, preview.start + preview.span - 1) * ROW_H,
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
          <input
            className="field rec-editor__title"
            placeholder="What is it?"
            autoFocus
            value={editor.title}
            onChange={(e) => setEditor({ ...editor, title: e.target.value })}
          />
          <SubjectChips
            subjects={subjects}
            value={editor.subjectId}
            onChange={(subjectId) => setEditor({ ...editor, subjectId })}
            onCreate={onCreateSubject}
          />
          <div className="rec-editor__actions">
            <button type="button" className="btn btn--primary" onClick={commitEditor}>
              {editor.id ? 'Save' : 'Add'}
            </button>
            <button type="button" className="btn" onClick={() => setEditor(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
