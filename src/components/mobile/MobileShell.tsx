import { useState } from 'react';
import { usePlanner } from '../../store/plannerStore';
import { setDevicePrefs, useDevicePrefs, type MobileTab } from '../../store/devicePrefs';
import { missedItems } from '../../lib/missed';
import { todayISO } from '../../lib/dates';
import { useSyncStatus } from '../../sync/status';
import { MobileWeek } from './MobileWeek';
import { MobileList } from './MobileList';
import { MobilePlanner } from './MobilePlanner';
import { SheetHost } from './sheets';

/**
 * The phone shell: one scrolling pane for the active tab, and the tab bar.
 *
 * There is no nested navigation anywhere in the phone design — every other
 * surface is a sheet over this. So "routing" is one value in device prefs,
 * which also means the app reopens on the tab it was left on, as an installed
 * app should.
 *
 * Week is not accompanied by a Today tab: Week opens on today at one day, so
 * the two would be the same screen.
 */

/* Icons are the canvas's own, drawn on a 16px grid at 22px with currentColor
   so the active and inactive states need no second copy. */
function IconWeek() {
  return (
    <svg viewBox="0 0 16 16" width="22" height="22" fill="none" strokeWidth="1.4"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
      <path d="M1.75 6.25h12.5M6 6.25v7M10 6.25v7" />
    </svg>
  );
}

function IconList() {
  return (
    <svg viewBox="0 0 16 16" width="22" height="22" fill="none" strokeWidth="1.4"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 4h11M2.5 8h11M2.5 12h7" />
    </svg>
  );
}

function IconPlanner() {
  return (
    <svg viewBox="0 0 16 16" width="22" height="22" fill="none" strokeWidth="1.4"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
      <path d="M5.75 2.75v10.5" />
    </svg>
  );
}

const TABS: { id: MobileTab; label: string; icon: () => JSX.Element }[] = [
  { id: 'week', label: 'Week', icon: IconWeek },
  { id: 'list', label: 'List', icon: IconList },
  { id: 'planner', label: 'Planner', icon: IconPlanner },
];

export function MobileShell() {
  const { state } = usePlanner();
  const { tab } = useDevicePrefs();
  const syncStatus = useSyncStatus();
  // Set from the Planner tab and read by the List. Ephemeral on purpose: a
  // filter is where you are, not a preference worth remembering.
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);
  /*
   * The List's own controls live here rather than inside it. Each pane is
   * keyed by tab so revisiting one starts it at the top, which would also
   * throw away these two — and a "Hide done" you set a moment ago should
   * still be set when you come back from the Week.
   */
  const [groupBy, setGroupBy] = useState<'day' | 'subject'>('day');
  const [hideDone, setHideDone] = useState(false);

  // Drives the dot on the Planner tab, where missed items live.
  const missed = missedItems(state.items, todayISO());

  const pane =
    tab === 'week' ? (
      <MobileWeek onShowMissed={() => setDevicePrefs({ tab: 'planner' })} />
    ) : tab === 'list' ? (
      <MobileList
        subjectFilter={subjectFilter}
        onClearFilter={() => setSubjectFilter(null)}
        groupBy={groupBy}
        onGroupBy={setGroupBy}
        hideDone={hideDone}
        onHideDone={setHideDone}
      />
    ) : (
      <MobilePlanner
        onOpenSubject={(id) => {
          setSubjectFilter(id);
          setDevicePrefs({ tab: 'list' });
        }}
      />
    );

  return (
    <SheetHost>
      <div className="m-shell">
        {syncStatus.phase === 'offline' && (
          <div className="m-offlinebar" role="status">
            Offline — changes will sync when you're back online.
          </div>
        )}

        {/* Keyed by tab so switching starts a pane at the top rather than
            inheriting the last one's scroll position. */}
        <div className="m-pane" key={tab}>
          {pane}
        </div>

        <nav className="m-tabbar" aria-label="Views">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className="m-tab"
              data-active={tab === id}
              aria-current={tab === id ? 'page' : undefined}
              onClick={() => setDevicePrefs({ tab: id })}
            >
              <Icon />
              {label}
              {id === 'planner' && missed.length > 0 && (
                <span className="m-tab__dot" aria-label={`${missed.length} missed`} />
              )}
            </button>
          ))}
        </nav>

        {syncStatus.phase === 'first-sync' && (
          <div className="m-firstsync" role="status">
            <p className="m-firstsync__text">Syncing your planner…</p>
          </div>
        )}
      </div>
    </SheetHost>
  );
}
