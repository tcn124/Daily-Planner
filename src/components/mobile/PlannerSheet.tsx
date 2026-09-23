import { useState } from 'react';
import { usePlanner } from '../../store/plannerStore';
import { DEFAULT_HUE } from '../../store/defaults';
import { clearState, exportState, importState } from '../../store/persistence';
import { subjectAccent } from '../../lib/color';
import { isTauri } from '../../lib/platform';
import { SwatchPicker } from '../SwatchPicker';
import { ConfirmDialog } from '../ConfirmDialog';
import { Sheet } from './Sheet';

interface Props {
  onClose: () => void;
}

interface Pending {
  message: string;
  confirmLabel: string;
  resolve: (ok: boolean) => void;
}

/**
 * The desktop's edit-planner panel, without "Days shown".
 *
 * That control is gone on purpose: the phone's 1/2/3 lives in the Week header
 * where it is one tap away, and it is device-local — a count set here would
 * read as a planner setting and imply it travels to the Mac.
 *
 * Subjects expand in place rather than pushing a second screen, which is the
 * same choice the desktop panel makes and the reason this fits in one sheet.
 */
export function PlannerSheet({ onClose }: Props) {
  const { state, dispatch } = usePlanner();
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  /** Promise-shaped, so the call sites below read top to bottom. */
  function confirm(message: string, confirmLabel: string): Promise<boolean> {
    return new Promise((resolve) => setPending({ message, confirmLabel, resolve }));
  }

  const countFor = (id: string) =>
    state.items.filter((i) => i.subjectId === id).length +
    state.recurring.filter((r) => r.subjectId === id).length;

  async function deleteSubject(id: string, name: string) {
    const used = countFor(id);
    const message = used
      ? `Delete "${name}"? ${used} item${used === 1 ? '' : 's'} will keep their text but lose the subject.`
      : `Delete "${name}"?`;
    if (await confirm(message, 'Delete')) dispatch({ type: 'subject/delete', id });
  }

  async function onImport() {
    setError(null);
    try {
      const next = await importState();
      if (!next) return; // cancelled
      if (await confirm('Replace all current planner data with this backup?', 'Replace')) {
        dispatch({ type: 'state/replace', state: next });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.');
    }
  }

  return (
    <>
      <Sheet title="Edit planner" onClose={onClose}>
        <span className="m-sheet__eyebrow">Subjects</span>
        <div className="m-sheet__group">
          {state.subjects.map((s) => (
            <div key={s.id} className="m-subject" data-open={open === s.id}>
              <div className="m-subject__row">
                <button
                  type="button"
                  className="m-subject__dot"
                  style={{ background: subjectAccent(s.hue) }}
                  aria-label={`Colour for ${s.name}`}
                  aria-expanded={open === s.id}
                  onClick={() => setOpen(open === s.id ? null : s.id)}
                />
                <input
                  className="m-subject__name"
                  value={s.name}
                  aria-label={`Name for ${s.name}`}
                  onChange={(e) =>
                    dispatch({
                      type: 'subject/update',
                      id: s.id,
                      patch: { name: e.target.value },
                    })
                  }
                />
                <span className="m-subject__count">{countFor(s.id)}</span>
                <button
                  type="button"
                  className="m-subject__del"
                  aria-label={`Delete ${s.name}`}
                  onClick={() => void deleteSubject(s.id, s.name)}
                >
                  ⌫
                </button>
              </div>
              {open === s.id && (
                <SwatchPicker
                  hue={s.hue}
                  onChange={(hue) =>
                    dispatch({ type: 'subject/update', id: s.id, patch: { hue } })
                  }
                />
              )}
            </div>
          ))}
          <button
            type="button"
            className="m-listrow m-listrow--action"
            onClick={() =>
              dispatch({
                type: 'subject/add',
                name: 'New subject',
                // Spread new subjects around the wheel so they stay distinct.
                hue: (DEFAULT_HUE + state.subjects.length * 47) % 360,
              })
            }
          >
            <span className="m-listrow__plus">+</span>New subject
          </button>
        </div>

        <span className="m-sheet__eyebrow">Data</span>
        <div className="m-sheet__group">
          <button type="button" className="m-listrow" onClick={() => void exportState(state)}>
            <span className="m-listrow__glyph">↧</span>
            <span className="m-listrow__title">Export backup</span>
          </button>
          <button type="button" className="m-listrow" onClick={() => void onImport()}>
            <span className="m-listrow__glyph">↥</span>
            <span className="m-listrow__title">Import backup</span>
          </button>
          <button
            type="button"
            className="m-listrow m-listrow--danger"
            onClick={() => {
              void (async () => {
                if (await confirm('Erase all planner data? This cannot be undone.', 'Erase everything')) {
                  clearState();
                  dispatch({ type: 'state/reset' });
                  onClose();
                }
              })();
            }}
          >
            <span className="m-listrow__glyph">⌫</span>
            <span className="m-listrow__title">Reset all data</span>
          </button>
        </div>

        {error && <p className="m-sheet__note m-sheet__note--error">{error}</p>}
        <p className="m-sheet__note">
          {isTauri()
            ? 'Saves automatically on this device.'
            : 'Saves automatically in this browser. Export before switching devices — until the two are syncing, it is the only copy.'}
        </p>
      </Sheet>

      {pending && (
        <ConfirmDialog
          message={pending.message}
          confirmLabel={pending.confirmLabel}
          danger
          onResolve={(ok) => {
            pending.resolve(ok);
            setPending(null);
          }}
        />
      )}
    </>
  );
}
