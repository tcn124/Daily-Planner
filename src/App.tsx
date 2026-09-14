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

  return (
    <div className="app">
      {/* Where the native title bar was: drag to move, double-click to zoom. */}
      <div className="titlebar-drag" data-tauri-drag-region />
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {focusedDate ? (
        <DayPage
          date={focusedDate}
          onClose={() => setFocusedDate(null)}
          onNavigate={setFocusedDate}
        />
      ) : state.settings.view === 'grid' ? (
        <WeekView onOpenDay={setFocusedDate} />
      ) : (
        <ListView />
      )}

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
