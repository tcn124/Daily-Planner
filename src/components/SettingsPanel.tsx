import { useState } from 'react';
import { usePlanner } from '../store/plannerStore';
import { DEFAULT_HUE } from '../store/defaults';
import { subjectAccent } from '../lib/color';
import { SwatchPicker } from './SwatchPicker';
import { ConfirmDialog } from './ConfirmDialog';
import { clearState, exportState, importState } from '../store/persistence';
import { DaysStepper } from './DaysStepper';
import { isTauri } from '../lib/platform';
import { setDays, useDevicePrefs } from '../store/devicePrefs';
import { formatRelativeTime } from '../sync/status';
import { useSyncAuth } from '../sync/useSyncAuth';

interface Props {
  onClose: () => void;
  /** Opens the native picker for a screenshot to import. Desktop only. */
  onImportScreenshot: () => void;
}

interface Pending {
  message: string;
  confirmLabel: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
}

export function SettingsPanel({ onClose, onImportScreenshot }: Props) {
  const { state, dispatch } = usePlanner();
  const { daysVisible } = useDevicePrefs();
  const sync = useSyncAuth();
  const [editingColor, setEditingColor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  /** Promise-shaped so the call sites read like the old `confirmAction`. */
  function confirm(
    message: string,
    { confirmLabel = 'Confirm', danger = false } = {},
  ): Promise<boolean> {
    return new Promise((resolve) =>
      setPending({ message, confirmLabel, danger, resolve }),
    );
  }

  const countFor = (id: string) =>
    state.items.filter((i) => i.subjectId === id).length +
    state.recurring.filter((r) => r.subjectId === id).length;

  async function deleteSubject(id: string, name: string) {
    const used = countFor(id);
    const message = used
      ? `Delete "${name}"? ${used} item${used === 1 ? '' : 's'} will keep their text but lose the subject.`
      : `Delete "${name}"?`;
    if (await confirm(message, { confirmLabel: 'Delete', danger: true })) {
      dispatch({ type: 'subject/delete', id });
    }
  }

  async function onImport() {
    setError(null);
    try {
      const next = await importState();
      if (!next) return; // cancelled
      if (
        await confirm('Replace all current planner data with this backup?', {
          confirmLabel: 'Replace',
          danger: true,
        })
      ) {
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
        aria-label="Edit planner"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <div className="panel__head">
          <h2 className="panel__title">Edit planner</h2>
          <button
            type="button"
            className="kill panel__close"
            aria-label="Close"
            onClick={onClose}
          />
        </div>

        <section className="panel__section">
          <span className="eyebrow">Subjects</span>
          {state.subjects.map((s) => (
            <div key={s.id}>
              <div
                className="subject-row"
                data-open={editingColor === s.id}
                onClick={() => setEditingColor(editingColor === s.id ? null : s.id)}
              >
                <span
                  className="subject-row__dot"
                  style={{ background: subjectAccent(s.hue) }}
                  aria-hidden="true"
                />
                <input
                  className="subject-row__name"
                  value={s.name}
                  aria-label={`Name for ${s.name}`}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    dispatch({
                      type: 'subject/update',
                      id: s.id,
                      patch: { name: e.target.value },
                    })
                  }
                />
                <span className="count">{countFor(s.id)} items</span>
                <button
                  type="button"
                  className="kill subject-row__del"
                  aria-label={`Delete ${s.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    void deleteSubject(s.id, s.name);
                  }}
                />
              </div>

              {editingColor === s.id && (
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
            className="panel__add"
            onClick={() =>
              dispatch({
                type: 'subject/add',
                name: 'New subject',
                // Spread new subjects around the wheel so they stay distinct.
                hue: (DEFAULT_HUE + state.subjects.length * 47) % 360,
              })
            }
          >
            <span className="panel__add-plus">+</span>Add subject
          </button>
        </section>

        <section className="panel__section">
          <span className="eyebrow">Days shown</span>
          <DaysStepper
            value={daysVisible}
            onChange={setDays}
          />
          <p className="panel__note">
            Anywhere from 1 to 14. The header arrows still move one day at a time.
          </p>
        </section>

        <section className="panel__section">
          <span className="eyebrow">Data</span>
          <div className="panel__buttons">
            <button
              type="button"
              className="btn"
              onClick={() => void exportState(state)}
            >
              Export JSON
            </button>
            <button type="button" className="btn" onClick={() => void onImport()}>
              Import JSON
            </button>
            {isTauri() && (
              <button type="button" className="btn" onClick={onImportScreenshot}>
                Import from screenshot or PDF…
              </button>
            )}
          </div>
          <button
            type="button"
            className="btn btn--danger panel__reset"
            onClick={() => {
              void (async () => {
                if (
                  await confirm('Erase all planner data? This cannot be undone.', {
                    confirmLabel: 'Erase everything',
                    danger: true,
                  })
                ) {
                  clearState();
                  dispatch({ type: 'state/reset' });
                }
              })();
            }}
          >
            Reset all data
          </button>
          {error && <p className="panel__note panel__note--error">{error}</p>}
          <p className="panel__note">
            Saves automatically. Export before switching machines — it&apos;s the only
            copy that leaves this Mac.
          </p>
          <p className="panel__note">
            {isTauri()
              ? 'Screenshots or PDFs of a Canvas calendar, assignment list, or syllabus can be pasted (⌘V) or dropped on the window too — several at once if you like. Text is read on this Mac.'
              : 'Importing from a screenshot or PDF needs the desktop app.'}
          </p>
        </section>

        {sync.status.phase !== 'unconfigured' && (
          <section className="panel__section">
            <span className="eyebrow">Sync</span>
            {sync.status.phase === 'signed-out' ? (
              <form
                className="panel__form"
                onSubmit={(e) => {
                  e.preventDefault();
                  sync.signIn();
                }}
              >
                <input
                  className="field"
                  type="email"
                  autoComplete="email"
                  placeholder="Email"
                  value={sync.email}
                  onChange={(e) => sync.setEmail(e.target.value)}
                />
                <input
                  className="field"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Password"
                  value={sync.password}
                  onChange={(e) => sync.setPassword(e.target.value)}
                />
                <button type="submit" className="btn btn--primary" disabled={sync.submitting}>
                  {sync.submitting ? 'Signing in…' : 'Sign in'}
                </button>
                {sync.error && <p className="panel__note panel__note--error">{sync.error}</p>}
              </form>
            ) : (
              <>
                <p className="panel__note">{sync.status.email}</p>
                <p className="panel__note">
                  {sync.status.phase === 'first-sync' && 'Doing the first sync…'}
                  {sync.status.phase === 'offline' && 'Offline — will sync when back online.'}
                  {sync.status.phase === 'synced' &&
                    (sync.status.lastSyncedAt == null
                      ? 'Synced'
                      : `Synced · ${formatRelativeTime(sync.status.lastSyncedAt)}`)}
                </p>
                <button type="button" className="btn" onClick={sync.signOut}>
                  Sign out
                </button>
              </>
            )}
          </section>
        )}
      </aside>

      {pending && (
        <ConfirmDialog
          message={pending.message}
          confirmLabel={pending.confirmLabel}
          danger={pending.danger}
          onResolve={(ok) => {
            pending.resolve(ok);
            setPending(null);
          }}
        />
      )}
    </>
  );
}
