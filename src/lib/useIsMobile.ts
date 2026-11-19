import { useSyncExternalStore } from 'react';
import { isTauri } from './platform';

/**
 * The width at which the phone shell takes over. 899px is one pixel under the
 * desktop shell's own `min-width`, so nothing that works today changes: below
 * it the desktop layout was already clipped and unusable.
 */
export const MOBILE_QUERY = '(max-width: 899px)';

/*
 * Never in the desktop app. Its window is at least 960pt wide, and
 * `useAppZoom` caps page zoom to keep it 900 CSS px wide — but that cap lands
 * a frame after a resize, and in that frame a zoomed window can dip under the
 * query. Clipping the desktop layout for a frame is invisible; swapping the
 * whole shell to the phone one and back is not.
 */
const query =
  typeof window !== 'undefined' && !isTauri() ? window.matchMedia(MOBILE_QUERY) : null;

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
