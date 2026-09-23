import { useEffect, useRef, useState } from 'react';
import { usePlanner } from '../store/plannerStore';
import { recognize, type ImportSource, type OcrLine } from '../lib/ocr';
import { headerSubject, parseOcr, type Candidate } from '../lib/ocrParse';
import { startOfWeek, todayISO } from '../lib/dates';
import { setAnchor, useDevicePrefs } from '../store/devicePrefs';
import { formatTimeInput } from '../lib/time';
import { subjectChipBg, subjectChipInk } from '../lib/color';
import type { ItemType } from '../types';

interface Props {
  /** The screenshots and PDFs to read, in the order they were given. */
  sources: ImportSource[];
  onClose: () => void;
}

type Phase =
  | { kind: 'reading'; done: number; total: number }
  | { kind: 'review'; rows: Row[]; lines: OcrLine[] }
  | { kind: 'error'; message: string };

interface Row extends Candidate {
  /** Ticked rows are the ones that get imported. */
  selected: boolean;
  /** Which file (and page, for a PDF) the row was read from. */
  origin: string;
}

const BAND_LABEL: Record<ItemType, string> = {
  assignment: 'Assignment',
  event: 'Event',
};

/**
 * Reads screenshots and PDFs on-device and lets the user check what was found
 * before it becomes planner items. Nothing is dispatched until they press
 * Import.
 */
export function ScreenshotImport({ sources, onClose }: Props) {
  const { state, dispatch } = usePlanner();
  const { subjects } = state;
  const { anchorDate, view } = useDevicePrefs();
  const [phase, setPhase] = useState<Phase>({ kind: 'reading', done: 0, total: sources.length });

  // Opened by a paste or a drop, nothing inside the panel has focus, so
  // Escape would go nowhere. Take focus so the key handler below sees it.
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ctx = { today: todayISO(), anchorMonth: anchorDate.slice(0, 7), subjects };
        const rows: Row[] = [];
        const lines: OcrLine[] = [];
        // Overlapping screenshots read the same assignment twice; keep the first.
        const seen = new Set<string>();
        for (const [i, source] of sources.entries()) {
          const pages = await recognize(source);
          if (cancelled) return;
          // A course named at the top of the first page covers the whole file.
          const fallbackSubjectId = pages[0] ? headerSubject(pages[0], subjects) : null;
          pages.forEach((page, p) => {
            lines.push(...page);
            const origin = pages.length > 1 ? `${source.name} · p.${p + 1}` : source.name;
            for (const c of parseOcr(page, { ...ctx, fallbackSubjectId })) {
              const key = `${c.date}|${c.description.toLowerCase()}`;
              if (seen.has(key)) continue;
              seen.add(key);
              // A row without a date can't be imported until one is typed in.
              rows.push({ ...c, selected: c.date !== null, origin });
            }
          });
          setPhase({ kind: 'reading', done: i + 1, total: sources.length });
        }
        setPhase({ kind: 'review', lines, rows });
      } catch (err) {
        if (cancelled) return;
        setPhase({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // The files are fixed for the life of the panel; subjects only affect guesses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources]);

  function patch(id: string, p: Partial<Row>) {
    setPhase((ph) =>
      ph.kind === 'review'
        ? { ...ph, rows: ph.rows.map((r) => (r.id === id ? { ...r, ...p } : r)) }
        : ph,
    );
  }

  function patchAll(p: Partial<Row>) {
    setPhase((ph) =>
      ph.kind === 'review' ? { ...ph, rows: ph.rows.map((r) => ({ ...r, ...p })) } : ph,
    );
  }

  function importRows() {
    if (phase.kind !== 'review') return;
    const chosen = phase.rows.filter((r) => r.selected && r.date && r.description.trim());
    for (const r of chosen) {
      dispatch({
        type: 'item/add',
        item: {
          type: r.type,
          subjectId: r.subjectId,
          description: r.description.trim(),
          details: r.details.trim(),
          time: r.time,
          date: r.date as string,
          done: false,
        },
      });
    }
    // Land the week on the first imported item so the result is visible.
    const earliest = chosen.map((r) => r.date as string).sort()[0];
    if (earliest && view === 'grid') {
      setAnchor(startOfWeek(earliest));
    }
    onClose();
  }

  const ready =
    phase.kind === 'review'
      ? phase.rows.filter((r) => r.selected && r.date && r.description.trim()).length
      : 0;

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside
        ref={panelRef}
        tabIndex={-1}
        className="panel panel--wide"
        role="dialog"
        aria-label="Import from screenshot"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <div className="panel__head">
          <h2 className="panel__title">Import from screenshot</h2>
          <button type="button" className="kill panel__close" aria-label="Close" onClick={onClose} />
        </div>

        {phase.kind === 'reading' && (
          <section className="panel__section">
            <p className="panel__note">
              {phase.total > 1
                ? `Reading ${Math.min(phase.done + 1, phase.total)} of ${phase.total}…`
                : sources[0]?.kind === 'pdf'
                  ? 'Reading the PDF…'
                  : 'Reading the screenshot…'}
            </p>
          </section>
        )}

        {phase.kind === 'error' && (
          <section className="panel__section">
            <p className="panel__note panel__note--error">{phase.message}</p>
          </section>
        )}

        {phase.kind === 'review' && phase.rows.length === 0 && (
          <section className="panel__section">
            <p className="panel__note">
              No dates were recognised. For a screenshot, try a tighter crop around
              the calendar or assignment list, with the month heading in view. This
              is what was read:
            </p>
            <pre className="ocr__raw">{phase.lines.map((l) => l.text).join('\n')}</pre>
          </section>
        )}

        {phase.kind === 'review' && phase.rows.length > 0 && (
          <>
            <section className="panel__section ocr__toolbar">
              <span className="eyebrow">
                {phase.rows.length} found · {ready} to import
              </span>
              <div className="ocr__tools">
                <button
                  type="button"
                  className="btn"
                  onClick={() => patchAll({ selected: ready < phase.rows.length })}
                >
                  {ready < phase.rows.length ? 'Select all' : 'Select none'}
                </button>
                <select
                  className="field ocr__select"
                  aria-label="Set every subject"
                  value=""
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '') return;
                    patchAll({ subjectId: v === '__none' ? null : v });
                  }}
                >
                  <option value="">Set all subjects to…</option>
                  <option value="__none">No subject</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </section>

            <section className="panel__section ocr__rows">
              {phase.rows.map((r) => {
                const subject = subjects.find((s) => s.id === r.subjectId);
                return (
                  <div key={r.id} className="ocr__row" data-selected={r.selected} data-undated={!r.date}>
                    <button
                      type="button"
                      className="checkbox"
                      role="checkbox"
                      aria-checked={r.selected}
                      aria-label={r.selected ? 'Skip this item' : 'Import this item'}
                      data-checked={r.selected}
                      onClick={() => patch(r.id, { selected: !r.selected })}
                    />
                    <div className="ocr__main">
                      <input
                        className="field ocr__desc"
                        value={r.description}
                        aria-label="Title"
                        onChange={(e) => patch(r.id, { description: e.target.value })}
                      />
                      <input
                        className="field ocr__details"
                        value={r.details}
                        placeholder="Details"
                        aria-label="Details"
                        onChange={(e) => patch(r.id, { details: e.target.value })}
                      />
                      <span className="ocr__source" title={`${r.origin}: ${r.source}`}>
                        {sources.length > 1 || r.origin.includes(' · p.') ? `${r.origin} — ` : ''}
                        {r.source}
                      </span>
                    </div>
                    <input
                      type="date"
                      className="field ocr__date"
                      value={r.date ?? ''}
                      aria-label="Date"
                      onChange={(e) =>
                        patch(r.id, { date: e.target.value || null, selected: r.selected || !!e.target.value })
                      }
                    />
                    <input
                      className="field ocr__time"
                      value={r.time}
                      placeholder="Time"
                      aria-label="Time"
                      onChange={(e) => patch(r.id, { time: e.target.value })}
                      onBlur={(e) => patch(r.id, { time: formatTimeInput(e.target.value).trim() })}
                    />
                    <select
                      className="field ocr__select"
                      aria-label="Subject"
                      value={r.subjectId ?? ''}
                      style={
                        subject
                          ? { background: subjectChipBg(subject.hue), color: subjectChipInk(subject.hue) }
                          : undefined
                      }
                      onChange={(e) => patch(r.id, { subjectId: e.target.value || null })}
                    >
                      <option value="">No subject</option>
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <select
                      className="field ocr__select"
                      aria-label="Band"
                      value={r.type}
                      onChange={(e) => patch(r.id, { type: e.target.value as ItemType })}
                    >
                      {(Object.keys(BAND_LABEL) as ItemType[]).map((t) => (
                        <option key={t} value={t}>{BAND_LABEL[t]}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </section>

            <section className="panel__section ocr__footer">
              <button
                type="button"
                className="btn btn--primary"
                disabled={ready === 0}
                onClick={importRows}
              >
                Import {ready} {ready === 1 ? 'item' : 'items'}
              </button>
              <button type="button" className="btn" onClick={onClose}>
                Cancel
              </button>
              <span className="panel__note ocr__hint">
                Read on this Mac — nothing leaves it. Dates are a best guess; check them.
              </span>
            </section>
          </>
        )}
      </aside>
    </>
  );
}
