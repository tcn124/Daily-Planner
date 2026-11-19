import { useEffect, useRef, useState } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { APP_ZOOM_STEPS, setAppZoom, useDevicePrefs } from '../store/devicePrefs';
import { isTauri } from './platform';

/**
 * The narrowest the page may be, in CSS px: the desktop shell's `min-width`.
 * Page zoom shrinks the CSS viewport, so zooming a 1280pt window to 150%
 * leaves 853px — narrower than the desktop layout can draw.
 */
const DESKTOP_MIN_WIDTH = 900;

/**
 * ⌘+ / ⌘− / ⌘0 zoom the desktop app the way they zoom a browser tab.
 *
 * Desktop app only. A browser tab already does this natively and better (it
 * remembers per site), so there it is left alone; WKWebView has no zoom
 * shortcuts of its own, which is why the Tauri window needs this.
 *
 * It goes through the webview's page zoom rather than CSS `zoom` on the root:
 * page zoom relayouts at a smaller CSS viewport exactly as a browser does, so
 * `clientX`, `getBoundingClientRect` and `scrollLeft` — which the week's
 * re-basing and the recurring bars' pointer math depend on — all stay in the
 * same units. CSS `zoom` makes those disagree in WebKit.
 *
 * The applied zoom is capped at whatever keeps the page `DESKTOP_MIN_WIDTH`
 * wide, re-checked on every resize, while the stored preference keeps the
 * level the user picked, so narrowing the window and widening it again comes
 * back to where they were.
 */
export function useAppZoom(): void {
  const { appZoom } = useDevicePrefs();
  // The window's width in points, which page zoom does not change — unlike
  // `innerWidth`, which is in CSS px and so moves with the zoom itself.
  const [windowWidth, setWindowWidth] = useState<number | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    const win = getCurrentWindow();
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    async function measure() {
      try {
        const [size, scale] = await Promise.all([win.innerSize(), win.scaleFactor()]);
        if (!cancelled) setWindowWidth(size.toLogical(scale).width);
      } catch {
        /* window gone mid-teardown */
      }
    }
    void measure();
    void win.onResized(() => void measure()).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // The window's own minWidth (960) already fits 100%, so the cap never takes
  // the page below actual size.
  const fit = windowWidth === null ? 1 : Math.max(1, windowWidth / DESKTOP_MIN_WIDTH);
  const applied = Math.min(appZoom, fit);

  useEffect(() => {
    // Until the window has been measured there is no cap to apply against, and
    // a fresh page is already at 1 — so wait rather than zoom twice.
    if (!isTauri() || windowWidth === null) return;
    void getCurrentWebview().setZoom(applied).catch(() => {});
  }, [applied, windowWidth]);

  // Read by the key handler, which is bound once.
  const live = useRef({ applied, fit });
  live.current = { applied, fit };

  useEffect(() => {
    if (!isTauri()) return;
    function onKey(e: KeyboardEvent) {
      if (!e.metaKey || e.altKey || e.ctrlKey) return;
      const { applied, fit } = live.current;
      // `=` is the unshifted + key; `+` arrives with Shift or from the keypad.
      if (e.key === '=' || e.key === '+') {
        // Step from what is on screen, not the stored level: if the window has
        // capped 125% down to 110%, ⌘+ should say no, not appear to do nothing
        // while quietly raising a preference that cannot be shown.
        const next = APP_ZOOM_STEPS.find((s) => s > applied + 1e-6);
        if (next !== undefined && next <= fit + 1e-6) setAppZoom(next);
      } else if (e.key === '-' || e.key === '_') {
        const next = [...APP_ZOOM_STEPS].reverse().find((s) => s < applied - 1e-6);
        if (next !== undefined) setAppZoom(next);
      } else if (e.key === '0') {
        setAppZoom(1);
      } else {
        return;
      }
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
