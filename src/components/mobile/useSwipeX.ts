import { useEffect, useRef } from 'react';

/**
 * A horizontal fling over a region, for changing which day or week is shown.
 *
 * The design asks for two horizontal gestures in the same screen: swipe a row
 * for its actions, swipe the bands to change day. They are told apart by where
 * the press lands — a press inside an item row belongs to that row, and this
 * takes everything else. Anything that scrolls or types is excluded too, so a
 * drag across the notes box selects text rather than moving the calendar.
 *
 * The axis is locked on the first movement past `SLOP` and never revisited, so
 * a gesture that starts as a scroll stays a scroll however far sideways it
 * drifts. Touch has the same decision made for it declaratively by
 * `touch-action: pan-y` on the element: the browser keeps vertical panning and
 * hands us horizontal, then fires `pointercancel` if it changes its mind.
 */

/** Movement needed before the gesture commits to an axis. */
const SLOP = 10;
/** Travel needed to actually change the day on release. */
const COMMIT = 56;
/** How far the content is allowed to follow the finger. */
const FOLLOW_MAX = 88;
/** Past `COMMIT` the content stops tracking 1:1 — it is going to move anyway. */
const FOLLOW_DAMP = 0.35;
/**
 * A drag ends in a mousedown/mouseup pair on one element, which the browser
 * reports as a click — so a fling across a band header would also collapse it.
 * The click that closes a gesture is swallowed; the timer is there for the
 * gestures that produce no click at all.
 */
const CLICK_DEAD_MS = 400;

export function useSwipeX<T extends HTMLElement>(
  onSwipe: (direction: -1 | 1) => void,
): React.RefObject<T> {
  const ref = useRef<T>(null);
  // Kept in a ref so the listeners can be attached once and still call the
  // newest closure — re-binding them mid-gesture would drop it.
  const latest = useRef(onSwipe);
  latest.current = onSwipe;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let start: { x: number; y: number } | null = null;
    let axis: 'x' | 'y' | null = null;

    function release() {
      start = null;
      axis = null;
      el!.style.transition = '';
      el!.style.transform = '';
    }

    function onDown(e: PointerEvent) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      // A row owns its own horizontal gesture; the day change is what is left.
      if (target?.closest('[data-swipe-row]')) return;
      // Text fields and their own drags come first.
      if (target?.closest('input, textarea, select')) return;
      start = { x: e.clientX, y: e.clientY };
      axis = null;
    }

    function onMove(e: PointerEvent) {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;

      if (axis === null) {
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
        axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        if (axis === 'y') {
          // Hand the gesture back: this is a scroll, and it stays one.
          start = null;
          return;
        }
        try {
          el!.setPointerCapture(e.pointerId);
        } catch {
          // Already released, or a synthetic event. The gesture is tracked by
          // coordinates either way, so this is not a reason to abandon it.
        }
        el!.style.transition = 'none';
      }

      const over = Math.max(0, Math.abs(dx) - COMMIT);
      const followed = Math.min(FOLLOW_MAX, Math.abs(dx) - over * (1 - FOLLOW_DAMP));
      el!.style.transform = `translateX(${Math.sign(dx) * followed}px)`;
    }

    function swallow(e: MouseEvent) {
      e.preventDefault();
      e.stopPropagation();
    }

    function onUp(e: PointerEvent) {
      if (!start) return;
      const dx = e.clientX - start.x;
      const swiped = axis === 'x';
      const committed = swiped && Math.abs(dx) > COMMIT;
      release();
      if (swiped) {
        el!.addEventListener('click', swallow, { capture: true, once: true });
        window.setTimeout(() => el!.removeEventListener('click', swallow, true), CLICK_DEAD_MS);
      }
      // Dragging left brings the next day in from the right, as a page turns.
      if (committed) latest.current(dx < 0 ? 1 : -1);
    }

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', release);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', release);
    };
  }, []);

  return ref;
}
