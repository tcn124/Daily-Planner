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
import { Close } from './icons';
import { useSyncAuth } from '../sync/useSyncAuth';

interface Props {
  onClose: () => void;
  /** Opens the native picker for a screenshot to import. Desktop only. */
  onImportScreenshot: () => void;
}

interface Pending {
  title?: string;
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
    {
      title,
      confirmLabel = 'Confirm',
      danger = false,
    }: { title?: string; confirmLabel?: string; danger?: boolean } = {},
  ): Promise<boolean> {
    return new Promise((resolve) =>
      setPending({ title, message, confirmLabel, danger, resolve }),
    );
  }

  const countFor = (id: string) =>
    state.items.filter((i) => i.subjectId === id).length +
    state.recurring.filter((r) => r.subjectId === id).length;

  async function deleteSubject(id: string, name: string) {
    const used = countFor(id);
    const message = used
      ? `${used} item${used === 1 ? '' : 's'} will keep their text but lose the subject.`
      : 'Nothing is filed under it yet.';
    if (await confirm(message, { title: `Delete ${name}?`, confirmLabel: 'Delete', danger: true })) {
      dispatch({ type: 'subject/delete', id });
    }
  }

  async function onImport() {
    setError(null);
    try {
      const next = await importState();
      if (!next) return; // cancelled
      if (
        await confirm('Everything in this planner is replaced by the backup.', {
          title: 'Import this backup?',
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
          <button type="button" className="panel__close" aria-label="Close" onClick={onClose}>
            <Close />
          </button>
        </div>

        <div className="panel__scroll">
          <span className="panel__label">Subjects</span>
          <div className="panel__rows">
            {state.subjects.map((s) => (
              <div key={s.id} className="subject-row" data-open={editingColor === s.id}>
                <div className="subject-row__line">
                  <button
                    type="button"
                    className="subject-row__swatch"
                    aria-label={`Colour for ${s.name}`}
                    aria-expanded={editingColor === s.id}
                    onClick={() => setEditingColor(editingColor === s.id ? null : s.id)}
                  >
                    <span style={{ background: subjectAccent(s.hue) }} />
                  </button>
                  <input
                    className="subject-row__name"
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
                  <span className="count">{countFor(s.id)}</span>
                  <button
                    type="button"
                    className="subject-row__del"
                    aria-label={`Delete ${s.name}`}
                    onClick={() => void deleteSubject(s.id, s.name)}
                  >
                    ⌫
                  </button>
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
              className="panel__row panel__row--muted"
              onClick={() =>
                dispatch({
                  type: 'subject/add',
                  name: 'New subject',
                  // Spread new subjects around the wheel so they stay distinct.
                  hue: (DEFAULT_HUE + state.subjects.length * 47) % 360,
                })
              }
            >
              + New subject
            </button>
          </div>

          <span className="panel__label">Days shown</span>
          <div className="panel__rows">
            <div className="panel__row panel__row--static">
              <DaysStepper value={daysVisible} onChange={setDays} />
            </div>
          </div>
          <p className="panel__note">
            Anywhere from 1 to 14. The header arrows still move one day at a time.
          </p>

          <span className="panel__label">Data</span>
          <div className="panel__rows">
            <button type="button" className="panel__row" onClick={() => void exportState(state)}>
              <span className="panel__glyph" aria-hidden="true">↧</span>Export backup
            </button>
            <button type="button" className="panel__row" onClick={() => void onImport()}>
              <span className="panel__glyph" aria-hidden="true">↥</span>Import backup
            </button>
            {isTauri() && (
              <button type="button" className="panel__row" onClick={onImportScreenshot}>
                <span className="panel__glyph" aria-hidden="true">⌗</span>Import screenshot or PDF…
              </button>
            )}
            <button
              type="button"
              className="panel__row panel__row--danger"
              onClick={() => {
                void (async () => {
                  if (
                    await confirm('Every subject, item and to-do is erased. This cannot be undone.', {
                      title: 'Reset all data?',
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
              <span className="panel__glyph" aria-hidden="true">⌫</span>Reset all data
            </button>
          </div>
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

          {sync.status.phase !== 'unconfigured' && (
            <>
              <span className="panel__label">Sync</span>
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
                  <button type="submit" className="btn btn--primary panel__submit"
                    disabled={sync.submitting}>
                    {sync.submitting ? 'Signing in…' : 'Sign in'}
                  </button>
                  {sync.error && <p className="panel__note panel__note--error">{sync.error}</p>}
                </form>
              ) : (
                <div className="panel__rows">
                  <div className="panel__row panel__row--static">
                    <span className="panel__glyph" aria-hidden="true">●</span>
                    <span className="panel__row-main">{sync.status.email}</span>
                    <span className="panel__row-meta">
                      {sync.status.phase === 'first-sync' && 'Doing the first sync…'}
                      {sync.status.phase === 'offline' && 'Offline'}
                      {sync.status.phase === 'synced' &&
                        (sync.status.lastSyncedAt == null
                          ? 'Synced'
                          : `Synced · ${formatRelativeTime(sync.status.lastSyncedAt)}`)}
                    </span>
                  </div>
                  <button type="button" className="panel__row" onClick={sync.signOut}>
                    <span className="panel__glyph" aria-hidden="true">→</span>Sign out
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      {pending && (
        <ConfirmDialog
          title={pending.title}
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
