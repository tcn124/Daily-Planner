import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { PlannerProvider } from './store/plannerStore';
import { isTauri } from './lib/platform';
import { registerServiceWorker } from './lib/pwa';
import './styles/global.css';

// The desktop window uses a transparent, title-less title bar, so the traffic
// lights float over our content. Flag it before first paint so the layout
// reserves room for them and the top strip becomes a drag handle.
if (isTauri()) {
  document.documentElement.dataset.titlebar = 'overlay';
  // The window is transparent over native Liquid Glass (`install_glass` in
  // src-tauri/src/lib.rs); `glass.css` turns the page's surfaces translucent
  // to match. A browser tab has nothing behind it, so it stays opaque.
  document.documentElement.dataset.glass = '';
}

registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PlannerProvider>
      <App />
    </PlannerProvider>
  </StrictMode>,
);
