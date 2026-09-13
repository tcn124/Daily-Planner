import { useState } from 'react';
import { usePlanner } from './store/plannerStore';
import { WeekView } from './components/WeekView';
import { ListView } from './components/ListView';
import { SettingsPanel } from './components/SettingsPanel';

export function App() {
  const { state } = usePlanner();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="app">
      {state.settings.view === 'grid' ? (
        <WeekView onOpenSettings={() => setSettingsOpen(true)} />
      ) : (
        <ListView onOpenSettings={() => setSettingsOpen(true)} />
      )}

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
