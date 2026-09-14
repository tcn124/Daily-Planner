import { useState } from 'react';
import { usePlanner } from './store/plannerStore';
import { WeekView } from './components/WeekView';
import { ListView } from './components/ListView';
import { DayPage } from './components/DayPage';
import { Sidebar } from './components/Sidebar';
import { SettingsPanel } from './components/SettingsPanel';

export function App() {
  const { state } = usePlanner();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // Day detail and sidebar collapse are view state, not saved preferences, so
  // they live here rather than in `settings` — no schema change, no migration.
  const [focusedDate, setFocusedDate] = useState<string | null>(null);

  /*
   * The top bar has a slot the current view fills with its own controls (month
   * and nav for the week, title and grouping for the list, breadcrumb for a
   * day). Views render into it through a portal, so the node has to exist in
   * state before they can target it.
   */
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  const view = focusedDate ? (
    <DayPage
      date={focusedDate}
      slot={slot}
      onClose={() => setFocusedDate(null)}
      onNavigate={setFocusedDate}
    />
  ) : state.settings.view === 'grid' ? (
    <WeekView slot={slot} onOpenDay={setFocusedDate} />
  ) : (
    <ListView slot={slot} />
  );

  return (
    <div className="app">
      {/* Owns the title zone: on the desktop this is where the traffic lights
          float, and the whole bar doubles as the window's drag handle. */}
      <header className="topbar" data-tauri-drag-region>
        <button
          type="button"
          className="topbar__toggle"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? '»' : '«'}
        </button>
        <div className="topbar__slot" ref={setSlot} data-tauri-drag-region />
      </header>

      <div className="app__body">
        <Sidebar collapsed={collapsed} onOpenSettings={() => setSettingsOpen(true)} />
        {view}
      </div>

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
