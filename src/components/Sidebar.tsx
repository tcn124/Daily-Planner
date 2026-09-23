import { usePlanner } from '../store/plannerStore';
import { subjectAccent } from '../lib/color';
import { daysBetween, startOfWeek, todayISO } from '../lib/dates';
import { missedItems } from '../lib/missed';
import { focusToday, setAnchor, setView, useDevicePrefs } from '../store/devicePrefs';
import { DEFAULT_HUE } from '../store/defaults';
import { exportState } from '../store/persistence';
import { isTauri } from '../lib/platform';

interface Props {
  collapsed: boolean;
  onOpenSettings: () => void;
  /** Opens the native picker for a screenshot to import. Desktop only. */
  onImportScreenshot: () => void;
}

const MISSED_SHOWN = 3;

function IconWeek() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
      <path d="M1.75 6.25h12.5M6 6.25v7M10 6.25v7" />
    </svg>
  );
}

function IconList() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 4h11M2.5 8h11M2.5 12h7" />
    </svg>
  );
}

function IconToday() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="5.75" />
      <path d="M8 4.75V8l2.25 1.6" />
    </svg>
  );
}

export function Sidebar({ collapsed, onOpenSettings, onImportScreenshot }: Props) {
  const { state, dispatch } = usePlanner();
  const { subjects, items, recurring } = state;
  const { view, daysVisible, daysBeforeToday } = useDevicePrefs();
  const today = todayISO();
  // The Today tab borrows the day count while it is selected; that borrowed
  // value is also what marks it active.
  const inToday = daysBeforeToday !== null;

  const countFor = (id: string) =>
    items.filter((i) => i.subjectId === id).length +
    recurring.filter((r) => r.subjectId === id).length;

  const todayCount = items.filter((i) => i.date === today).length;

  const missed = missedItems(items, today);

  const subjectName = (id: string | null) =>
    subjects.find((s) => s.id === id)?.name ?? 'No subject';

  /** Jump the visible window to the week containing a missed item. */
  function revealMissed(date: string) {
    // A whole-week window lands on the Monday; any other count lands on the
    // day itself, so the item is the leftmost column rather than off-screen.
    setAnchor(daysVisible % 7 === 0 ? startOfWeek(date) : date);
    setView('grid');
  }

  function rescheduleAll() {
    for (const item of missed) {
      dispatch({ type: 'item/update', id: item.id, patch: { date: today } });
    }
    focusToday();
  }

  function addSubject() {
    dispatch({
      type: 'subject/add',
      name: 'New subject',
      // Spread new subjects around the wheel so they stay distinct.
      hue: (DEFAULT_HUE + subjects.length * 47) % 360,
    });
    onOpenSettings();
  }

  if (collapsed) {
    return (
      <aside className="sidebar sidebar--collapsed">
        <button type="button" className="sidebar__rail-btn" aria-label="Week view"
          title="Week" data-active={view === 'grid' && !inToday}
          onClick={() => setView('grid')}>
          <IconWeek />
        </button>
        <button type="button" className="sidebar__rail-btn" aria-label="List view"
          title="List" data-active={view === 'list'} onClick={() => setView('list')}>
          <IconList />
        </button>
        <button type="button" className="sidebar__rail-btn" aria-label="Today"
          title="Today" data-active={inToday} onClick={focusToday}>
          <IconToday />
        </button>

        <span className="sidebar__rule" aria-hidden="true" />

        <div className="sidebar__rail-dots" aria-hidden="true">
          {subjects.slice(0, 5).map((s) => (
            <span key={s.id} className="dot" style={{ background: subjectAccent(s.hue) }}
              title={s.name} />
          ))}
        </div>

        <button type="button" className="sidebar__rail-btn sidebar__rail-spacer"
          aria-label="Edit planner" title="Edit planner" onClick={onOpenSettings}>
          ⚙
        </button>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <nav className="sidebar__group sidebar__group--nav">
        <button type="button" className="sidebar__row sidebar__row--nav"
          data-active={view === 'grid' && !inToday}
          onClick={() => setView('grid')}>
          <span className="sidebar__icon"><IconWeek /></span>
          <span className="sidebar__row-label">Week</span>
        </button>
        <button type="button" className="sidebar__row sidebar__row--nav"
          data-active={view === 'list'} onClick={() => setView('list')}>
          <span className="sidebar__icon"><IconList /></span>
          <span className="sidebar__row-label">List</span>
        </button>
        <button type="button" className="sidebar__row sidebar__row--nav"
          data-active={inToday} onClick={focusToday}>
          <span className="sidebar__icon"><IconToday /></span>
          <span className="sidebar__row-label">Today</span>
          {todayCount > 0 && <span className="count">{todayCount}</span>}
        </button>
      </nav>

      <div className="sidebar__group">
        <div className="sidebar__group-head">
          <span className="eyebrow">Subjects</span>
        </div>
        {subjects.map((s) => (
          <button key={s.id} type="button" className="sidebar__row sidebar__row--subject"
            onClick={onOpenSettings} title={`Edit ${s.name}`}>
            <span className="dot" style={{ background: subjectAccent(s.hue) }} />
            <span className="sidebar__row-label">{s.name}</span>
            <span className="count">{countFor(s.id)}</span>
          </button>
        ))}
        <button type="button" className="sidebar__row sidebar__row--muted" onClick={addSubject}>
          <span className="sidebar__plus">+</span>
          <span className="sidebar__row-label">New subject</span>
        </button>
      </div>

      {missed.length > 0 && (
        <div className="sidebar__group">
          <div className="sidebar__group-head">
            <span className="eyebrow">Missed</span>
            <span className="sidebar__badge">{missed.length}</span>
          </div>
          {missed.slice(0, MISSED_SHOWN).map((item) => {
            const late = daysBetween(item.date, today);
            const title = item.description || 'Untitled';
            return (
              <div key={item.id} className="sidebar__missed">
                <span className="sidebar__missed-row">
                  <span className="sidebar__missed-dot" />
                  <button type="button" className="sidebar__missed-title"
                    title="Show this day" onClick={() => revealMissed(item.date)}>
                    {title}
                  </button>
                  <button type="button" className="kill sidebar__missed-kill"
                    aria-label={`Delete ${title}`}
                    onClick={() => dispatch({ type: 'item/delete', id: item.id })} />
                  <button type="button" className="checkbox" data-checked={false}
                    aria-label={`Mark ${title} as done`}
                    onClick={() => dispatch({ type: 'item/toggle', id: item.id })} />
                </span>
                <span className="sidebar__missed-meta">
                  {subjectName(item.subjectId)} · {late} day{late === 1 ? '' : 's'} late
                </span>
              </div>
            );
          })}
          <button type="button" className="sidebar__link" onClick={rescheduleAll}>
            Reschedule all →
          </button>
        </div>
      )}

      <div className="sidebar__footer">
        <button type="button" className="sidebar__row" onClick={onOpenSettings}>
          <span className="sidebar__icon sidebar__icon--text">⚙</span>
          <span className="sidebar__row-label">Edit planner</span>
        </button>
        <button type="button" className="sidebar__row" onClick={() => void exportState(state)}>
          <span className="sidebar__icon sidebar__icon--text">↧</span>
          <span className="sidebar__row-label">Export backup</span>
        </button>
        {isTauri() && (
          <button type="button" className="sidebar__row" onClick={onImportScreenshot}>
            <span className="sidebar__icon sidebar__icon--text">⌗</span>
            <span className="sidebar__row-label">Import screenshot</span>
          </button>
        )}
      </div>
    </aside>
  );
}
