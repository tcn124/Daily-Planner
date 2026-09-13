import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { PlannerProvider } from './store/plannerStore';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PlannerProvider>
      <App />
    </PlannerProvider>
  </StrictMode>,
);
