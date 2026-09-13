import { useState } from 'react';
import { usePlanner } from '../store/plannerStore';
import { DEFAULT_HUE } from '../store/defaults';
import { subjectLabel } from '../lib/color';
import { HuePicker } from './HuePicker';
import { clearState, exportState, importState } from '../store/persistence';
import { confirmAction } from '../lib/dialogs';
import type { DaysVisible } from '../types';

interface Props {
  onClose: () => void;
}

const DAY_OPTIONS: DaysVisible[] = [3, 5, 7];

export function SettingsPanel({ onClose }: Props) {
  const { state, dispatch } = usePlanner();
  const [editingColor, setEditingColor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function deleteSubject(id: string, name: string) {
    const used =
      state.items.filter((i) => i.subjectId === id).length +
      state.recurring.filter((r) => r.subjectId === id).length;
    const message = used
      ? `Delete "${name}"? ${used} item${used === 1 ? '' : 's'} will keep their text but lose the subject.`
      : `Delete "${name}"?`;
    if (await confirmAction(message)) dispatch({ type: 'subject/delete', id });
  }

  async function onImport() {
    setError(null);
    try {
      const next = await importState();
      if (!next) return; // cancelled
      if (await confirmAction('Replace all current planner data with this backup?')) {
        dispatch({ type: 'state/replace', state: next });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.');
    }
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside
        className="panel"
        role="dialog"
        aria-label="Planner settings"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <div className="panel__head">
          <h2 className="panel__title">Edit</h2>
          <button
            type="button"
            className="panel__close"
            aria-label="Close settings"
            onClick={onClose}
          >
            <span className="kill" aria-hidden="true" />
          </button>
        </div>

        <section className="panel__section">
          <h3>Subjects</h3>
          {state.subjects.map((s) => (
            <div key={s.id}>
              <div className="subject-row">
                <button
                  type="button"
                  className="subject-row__color"
                  style={{ background: subjectLabel(s.hue) }}
                  aria-label={`Change color for ${s.name}`}
                  onClick={() =>
                    setEditingColor(editingColor === s.id ? null : s.id)
                  }
                />
                <input
                  className="field subject-row__name"
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
                <button
                  type="button"
                  className="subject-row__del"
                  aria-label={`Delete ${s.name}`}
                  onClick={() => void deleteSubject(s.id, s.name)}
                >
                  <span className="kill" aria-hidden="true" />
                </button>
              </div>

              {editingColor === s.id && (
                <div className="panel__swatches">
                  <HuePicker
                    hue={s.hue}
                    onChange={(hue) =>
                      dispatch({
                        type: 'subject/update',
                        id: s.id,
                        patch: { hue },
                      })
                    }
                  />
                </div>
              )}
            </div>
          ))}

          <div className="panel__buttons">
            <button
              type="button"
              className="btn"
              onClick={() =>
                dispatch({
                  type: 'subject/add',
                  name: 'New subject',
                  // Spread new subjects around the wheel so they stay distinct.
                  hue: (DEFAULT_HUE + state.subjects.length * 47) % 360,
                })
              }
            >
              + Add subject
            </button>
          </div>
        </section>

        <section className="panel__section">
          <h3>Days shown</h3>
          <div className="segmented">
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                data-active={state.settings.daysVisible === d}
                onClick={() => dispatch({ type: 'settings/days', days: d })}
              >
                {d}
              </button>
            ))}
          </div>
          <p className="panel__note">
            How many days the grid shows at once. The header arrows always move
            one day at a time.
          </p>
        </section>

        <section className="panel__section">
          <h3>Data</h3>
          <div className="panel__buttons">
            <button type="button" className="btn" onClick={() => void exportState(state)}>
              Export JSON
            </button>
            <button type="button" className="btn" onClick={() => void onImport()}>
              Import JSON
            </button>
            <button
              type="button"
              className="btn panel__danger"
              onClick={() => {
                void (async () => {
                  if (
                    await confirmAction(
                      'Erase all planner data? This cannot be undone.',
                    )
                  ) {
                    clearState();
                    dispatch({ type: 'state/reset' });
                  }
                })();
              }}
            >
              Reset all data
            </button>
          </div>
          {error && <p className="panel__note">{error}</p>}
          <p className="panel__note">
            Your planner saves automatically as you work. Export a backup before
            switching machines — it is the only copy that leaves this Mac.
          </p>
        </section>
      </aside>
    </>
  );
}
