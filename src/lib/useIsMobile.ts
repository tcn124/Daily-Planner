import { useSyncExternalStore } from 'react';

/**
 * The width at which the phone shell takes over. 899px is one pixel under the
 * desktop shell's own `min-width`, so nothing that works today changes: below
 * it the desktop layout was already clipped and unusable.
 */
export const MOBILE_QUERY = '(max-width: 899px)';

const query = typeof window !== 'undefined' ? window.matchMedia(MOBILE_QUERY) : null;

function subscribe(listener: () => void): () => void {
  query?.addEventListener('change', listener);
  return () => query?.removeEventListener('change', listener);
}

/** True while the window is narrow enough for the phone shell. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => query?.matches ?? false,
    () => false,
  );
}
