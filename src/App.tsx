import { useEffect, useRef, useState } from 'react';
import { usePlanner } from './store/plannerStore';
import { WeekView } from './components/WeekView';
import { ListView } from './components/ListView';
import { DayPage } from './components/DayPage';
import { Sidebar } from './components/Sidebar';
import { SettingsPanel } from './components/SettingsPanel';
import { ScreenshotImport } from './components/ScreenshotImport';
import { isTauri } from './lib/platform';
import { pickSources, sourcesFromFiles, type ImportSource } from './lib/ocr';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * The top bar is the window's drag handle: any press on it that is not on a
 * control starts an OS window drag, and a double-click zooms, as the native
 * title bar did.
 *
 * Three things this has to get right. The bar's contents arrive through a
 * React portal, and React routes events along its component tree — so a React
 * `onMouseDown` on the bar never sees presses on the month, the grid, or the
 * empty space, since those belong to the view. A native listener on the bar
 * element does, because in the DOM they really are inside it. The request must
 * go out synchronously while the button is still down. And it goes to our own
 * `drag_window` command rather than Tauri's `startDragging`, which on macOS
 * hands the OS whatever event is current when the request lands — on a
 * trackpad, often a pressure event — and then silently does nothing.
 */
function useWindowDrag() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !isTauri()) return;
    function onDown(e: globalThis.MouseEvent) {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('button, input, select, textarea, a, [role="button"]')) return;
      e.preventDefault();
      void (e.detail === 2 ? getCurrentWindow().toggleMaximize() : invoke('drag_window'));
    }
    el.addEventListener('mousedown', onDown);
    return () => el.removeEventListener('mousedown', onDown);
  }, []);
  return ref;
}

/**
 * Lets screenshots and PDFs arrive by ⌘V or by dropping files on the window.
 * Several at once are fine. Desktop only — the OCR behind it is native.
 *
 * Paste is ignored while a text field has focus so it keeps meaning "paste
 * text here". File drops are told apart from the app's own card drags by the
 * `Files` type; those carry `ITEM_DRAG_TYPE` instead and are left to their
 * own drop targets.
 */
function useImageIntake(onSources: (sources: ImportSource[]) => void) {
  useEffect(() => {
    if (!isTauri()) return;

    function inTextField() {
      const el = document.activeElement as HTMLElement | null;
      return !!el && (el.matches('input, textarea, select') || el.isContentEditable);
    }
    function take(files: FileList | null | undefined) {
      void sourcesFromFiles(files).then((sources) => {
        if (sources.length) onSources(sources);
      });
    }

    function onPaste(e: ClipboardEvent) {
      if (inTextField()) return;
      const files = e.clipboardData?.files;
      if (!files?.length) return;
      e.preventDefault();
      take(files);
    }
    function onDragOver(e: DragEvent) {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
    function onDrop(e: DragEvent) {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      take(e.dataTransfer.files);
    }

    window.addEventListener('paste', onPaste);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [onSources]);
}

export function App() {
  const { state } = usePlanner();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // Files waiting to be read; the review panel is open while this is set.
  const [pendingImport, setPendingImport] = useState<ImportSource[] | null>(null);
  useImageIntake(setPendingImport);
  function importScreenshot() {
    void pickSources().then((sources) => {
      if (sources.length) {
        setSettingsOpen(false);
        setPendingImport(sources);
      }
    });
  }
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
  const barRef = useWindowDrag();

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
      <header className="topbar" ref={barRef}>
        <button
          type="button"
          className="topbar__toggle"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? '»' : '«'}
        </button>
        <div className="topbar__slot" ref={setSlot} />
      </header>

      <div className="app__body">
        <Sidebar
          collapsed={collapsed}
          onOpenSettings={() => setSettingsOpen(true)}
          onImportScreenshot={importScreenshot}
        />
        {view}
      </div>

      {settingsOpen && (
        <SettingsPanel
          onClose={() => setSettingsOpen(false)}
          onImportScreenshot={importScreenshot}
        />
      )}
      {pendingImport && (
        <ScreenshotImport sources={pendingImport} onClose={() => setPendingImport(null)} />
      )}
    </div>
  );
}
