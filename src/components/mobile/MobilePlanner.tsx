import { usePlanner } from '../../store/plannerStore';
import { missedItems } from '../../lib/missed';
import { subjectAccent } from '../../lib/color';
import { daysBetween, todayISO } from '../../lib/dates';
import { activeDates, rowsForDate } from '../../lib/listRows';
import { exportState } from '../../store/persistence';
import { DEFAULT_HUE } from '../../store/defaults';
import { formatRelativeTime, useSyncStatus } from '../../sync/status';
import { useSheets } from './sheets';

interface Props {
  /** Opens the List tab narrowed to one subject. */
  onOpenSubject: (id: string) => void;
}

/**
 * Everything the desktop sidebar held that is not a view: missed items,
 * subjects, and the planner's own settings.
 *
 * The canvas shows a sync line under the masthead ("Synced with desktop · 2
 * min ago"). It only renders once there is something true to say — not
 * configured, or not signed in yet, and it stays off rather than showing a
 * status that describes nothing.
 */
export function MobilePlanner({ onOpenSubject }: Props) {
  const { state, dispatch } = usePlanner();
  const { openItem, openPlanner } = useSheets();
  const syncStatus = useSyncStatus();
  const { subjects, items, recurring } = state;

  const today = todayISO();
  const missed = missedItems(items, today);

  /*
   * Counted as rows, not records, because tapping a subject opens the List
   * filtered to it — the number has to be a promise about what appears there.
   * A recurring span covering five days is five rows in both places.
   */
  const allRows = activeDates(items, recurring).flatMap((d) =>
    rowsForDate(d, items, recurring, subjects),
  );
  const countFor = (id: string) => allRows.filter((r) => r.subjectId === id).length;

  const subjectName = (id: string | null) =>
    subjects.find((s) => s.id === id)?.name ?? 'No subject';

  function moveAllToToday() {
    for (const item of missed) {
      dispatch({ type: 'item/update', id: item.id, patch: { date: today } });
    }
  }

  function addSubject() {
    dispatch({
      type: 'subject/add',
      name: 'New subject',
      // Spread new subjects around the wheel so they stay distinct.
      hue: (DEFAULT_HUE + subjects.length * 47) % 360,
    });
  }

  return (
    <div className="m-planner">
      <div className="m-head m-head--planner">
        <h1 className="m-head__title m-head__title--short">Planner</h1>
      </div>
      {syncStatus.phase === 'synced' && (
        <span className="m-planner__sync">
          {syncStatus.lastSyncedAt == null
            ? 'Synced with desktop'
            : `Synced with desktop · ${formatRelativeTime(syncStatus.lastSyncedAt)}`}
        </span>
      )}

      {missed.length > 0 && (
        <>
          <div className="m-section">
            <span className="m-section__label">Missed</span>
            <span className="m-missed__count">{missed.length}</span>
          </div>
          <div className="m-card-list">
            {missed.map((item) => {
              const late = daysBetween(item.date, today);
              return (
                <div key={item.id} className="m-listrow">
                  <span className="m-listrow__dot" />
                  <span className="m-listrow__body">
                    <span className="m-listrow__title">{item.description || 'Untitled'}</span>
                    <span className="m-listrow__sub">
                      {subjectName(item.subjectId)} · {late} day{late === 1 ? '' : 's'} late
                    </span>
                  </span>
                  <button
                    type="button"
                    className="m-listrow__more"
                    aria-label={`Actions for ${item.description || 'item'}`}
                    onClick={() => openItem({ kind: 'item', id: item.id, date: item.date })}
                  >
                    ⋯
                  </button>
                </div>
              );
            })}
            <button type="button" className="m-listrow m-listrow--action" onClick={moveAllToToday}>
              Move all to today →
            </button>
          </div>
        </>
      )}

      <div className="m-section">
        <span className="m-section__label">Subjects</span>
        <button type="button" className="m-section__action" onClick={openPlanner}>
          Edit
        </button>
      </div>
      <div className="m-card-list">
        {subjects.map((s) => (
          <button
            key={s.id}
            type="button"
            className="m-listrow"
            onClick={() => onOpenSubject(s.id)}
          >
            <span
              className="m-listrow__dot m-listrow__dot--subject"
              style={{ background: subjectAccent(s.hue) }}
            />
            <span className="m-listrow__title">{s.name}</span>
            <span className="m-listrow__count">{countFor(s.id)}</span>
            <span className="m-listrow__chevron" aria-hidden="true">
              ›
            </span>
          </button>
        ))}
        <button type="button" className="m-listrow m-listrow--action" onClick={addSubject}>
          <span className="m-listrow__plus">+</span>New subject
        </button>
      </div>

      <div className="m-card-list">
        <button type="button" className="m-listrow" onClick={openPlanner}>
          <span className="m-listrow__glyph">⚙</span>
          <span className="m-listrow__title">Edit planner</span>
          <span className="m-listrow__chevron" aria-hidden="true">
            ›
          </span>
        </button>
        <button type="button" className="m-listrow" onClick={() => void exportState(state)}>
          <span className="m-listrow__glyph">↧</span>
          <span className="m-listrow__title">Export backup</span>
        </button>
      </div>

      <p className="m-planner__note">
        Syllabus and screenshot import are only on the desktop app.
      </p>
    </div>
  );
}
