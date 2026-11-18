import { useState } from 'react';
import { setDevicePrefs, useDevicePrefs, type MobileTab } from '../../store/devicePrefs';
import { todayISO } from '../../lib/dates';
import { useSyncStatus } from '../../sync/status';
import { Plus } from '../icons';
import { MobileWeek } from './MobileWeek';
import { MobileList } from './MobileList';
import { MobilePlanner } from './MobilePlanner';
import { SheetHost, useSheets } from './sheets';
import type { GroupBy } from './FilterSheet';

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

const TABS: { id: MobileTab; label: string }[] = [
  { id: 'week', label: 'Week' },
  { id: 'list', label: 'List' },
  { id: 'planner', label: 'Planner' },
];

/**
 * Three text tabs and one round + at the right (frame 4a): the only add
 * button on the phone, within thumb reach and never over content.
 */
function TabBar() {
  const { tab, anchorDate } = useDevicePrefs();
  const { openCompose } = useSheets();
  return (
    <nav className="m-tabbar" aria-label="Views">
      {TABS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          className="m-tab"
          data-active={tab === id}
          aria-current={tab === id ? 'page' : undefined}
          onClick={() => setDevicePrefs({ tab: id })}
        >
          {label}
          <span className="m-tab__rule" aria-hidden="true" />
        </button>
      ))}
      <button
        type="button"
        className="m-tabbar__plus"
        aria-label="New item"
        // On the Week a new item lands on the day you are looking at; elsewhere
        // nothing is "being looked at", so it lands on today.
        onClick={() =>
          openCompose({
            mode: 'new',
            date: tab === 'week' ? anchorDate : todayISO(),
            band: 'assignment',
          })
        }
      >
        <Plus size={18} strokeWidth={1} />
      </button>
    </nav>
  );
}

export function MobileShell() {
  const { tab } = useDevicePrefs();
  const syncStatus = useSyncStatus();
  // Set from the List's filter sheet and the Planner tab's subjects. Ephemeral
  // on purpose: a filter is where you are, not a preference worth remembering.
  const [subjectFilter, setSubjectFilter] = useState<Set<string>>(new Set());
  /*
   * The List's own view choices live here rather than inside it. Each pane is
   * keyed by tab so revisiting one starts it at the top, which would also
   * throw away these two — and a "Hide done" you set a moment ago should
   * still be set when you come back from the Week.
   */
  const [groupBy, setGroupBy] = useState<GroupBy>('day');
  const [hideDone, setHideDone] = useState(false);

  const pane =
    tab === 'week' ? (
      <MobileWeek />
    ) : tab === 'list' ? (
      <MobileList
        subjectFilter={subjectFilter}
        onFilter={setSubjectFilter}
        groupBy={groupBy}
        onGroupBy={setGroupBy}
        hideDone={hideDone}
        onHideDone={setHideDone}
      />
    ) : (
      <MobilePlanner
        onOpenSubject={(id) => {
          setSubjectFilter(new Set([id]));
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

        <TabBar />

        {syncStatus.phase === 'first-sync' && (
          <div className="m-firstsync" role="status">
            <p className="m-firstsync__text">Syncing your planner…</p>
          </div>
        )}
      </div>
    </SheetHost>
  );
}
