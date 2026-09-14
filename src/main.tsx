import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { PlannerProvider } from './store/plannerStore';
import { isTauri } from './lib/platform';
import './styles/global.css';

// The desktop window uses a transparent, title-less title bar, so the traffic
// lights float over our content. Flag it before first paint so the layout
// reserves room for them and the top strip becomes a drag handle.
if (isTauri()) document.documentElement.dataset.titlebar = 'overlay';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PlannerProvider>
      <App />
    </PlannerProvider>
  </StrictMode>,
);
