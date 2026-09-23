import { isTauri } from './platform';

/**
 * Registers the service worker that makes the installed app work offline.
 *
 * Two guards, for two different reasons. The mode check is a build-time
 * constant, so the whole body is dropped from the desktop bundle — only
 * `npm run build:pwa` produces an `sw.js` to register. The `isTauri` check is
 * the one that matters if that ever stops being true: a service worker inside
 * the desktop shell would start serving the app its own stale assets, and
 * there is no address bar in there to force past it.
 */
export function registerServiceWorker(): void {
  if (import.meta.env.MODE !== 'pwa') return;
  if (isTauri()) return;
  if (!('serviceWorker' in navigator)) return;

  // After load, so registration never competes with the first paint.
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Losing this costs offline support, not the app. Private windows and
      // some enterprise profiles refuse it outright.
    });
  });
}
