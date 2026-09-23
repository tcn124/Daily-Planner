import { useRef, type PointerEvent, type ReactNode } from 'react';

/**
 * Swipe actions on a one-day row.
 *
 * The desktop reveals a card's × on hover; a finger has no hover, so the
 * design puts the same reach behind a swipe. Right for done, because it is the
 * thing you came to do and it commits on release with nothing more to tap.
 * Left for the two that deserve a second thought — Move and Delete — which
 * open and wait to be pressed.
 *
 * Only at one day. At two and three days a column is about 120pt wide, and a
 * 72pt action pane inside it would leave no row to swipe.
 */

/** Right swipe: one action. Left swipe: two, at 72pt each. */
const DONE_W = 72;
const ACTIONS_W = 144;
/** Movement needed before the gesture commits to an axis. */
const SLOP = 8;
/** Travel needed to fire on release. */
const COMMIT = 48;
/**
 * How long after a swipe the click it generates is ignored. A drag ends in a
 * mousedown/mouseup pair on the same row, which the browser reports as a click
 * — so without this, every swipe is followed by a tap on the row it just
 * swiped, closing the pane it had only that instant opened.
 */
const CLICK_DEAD_MS = 400;

/**
 * Keeps the gesture alive when the finger leaves the row. It throws if the
 * pointer is already gone — a release that beat us here, or a synthetic event —
 * and losing capture is not a reason to abandon a swipe already in progress.
 */
function capture(el: Element, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    /* no live pointer; the handlers below still track it by coordinates */
  }
}

interface Props {
  /** False at two and three days, where the row is a card in a column. */
  enabled: boolean;
  /** Only one row is open at a time; the list above owns which. */
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onDone: () => void;
  onMove: () => void;
  onDelete: () => void;
  /** "Done" / "Undo" — a finished row's right swipe puts it back. */
  doneLabel: string;
  children: ReactNode;
}

export function SwipeRow({
  enabled,
  open,
  onOpen,
  onClose,
  onDone,
  onMove,
  onDelete,
  doneLabel,
  children,
}: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; axis: 'x' | 'y' | null; base: number } | null>(null);
  /** When set, the next click is the tail of a swipe and is thrown away. */
  const deadUntil = useRef(0);

  function settle() {
    const body = bodyRef.current;
    drag.current = null;
    if (!body) return;
    // Clearing both hands the resting position back to CSS, which animates to
    // wherever `data-open` now says it should be.
    body.style.transition = '';
    body.style.transform = '';
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!enabled) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, axis: null, base: open ? -ACTIONS_W : 0 };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const body = bodyRef.current;
    if (!d || !body) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;

    if (d.axis === null) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (d.axis === 'y') {
        // A scroll. Give it up entirely rather than fighting the pane.
        drag.current = null;
        return;
      }
      capture(e.currentTarget, e.pointerId);
      body.style.transition = 'none';
    }

    const next = Math.max(-ACTIONS_W, Math.min(DONE_W, d.base + dx));
    body.style.transform = `translateX(${next}px)`;
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const axis = d.axis;
    settle();
    if (axis !== 'x') return;
    deadUntil.current = Date.now() + CLICK_DEAD_MS;

    if (d.base === 0) {
      // From rest: right commits done, left opens the action pane.
      if (dx > COMMIT) {
        onDone();
        onClose();
      } else if (dx < -COMMIT) {
        onOpen();
      } else {
        onClose();
      }
    } else if (dx > COMMIT / 2) {
      // Already open: a shove back to the right closes it again.
      onClose();
    }
  }

  return (
    <div className="m-swipe" data-open={open} data-swipe-row={enabled ? '' : undefined}>
      {/* Both panes sit under the row, at the edge their swipe uncovers. */}
      <div className="m-swipe__pane m-swipe__pane--start" aria-hidden="true">
        <span className="m-swipe__label">{doneLabel}</span>
      </div>
      <div className="m-swipe__pane m-swipe__pane--end">
        <button
          type="button"
          className="m-swipe__btn m-swipe__btn--move"
          tabIndex={open ? 0 : -1}
          onClick={() => {
            onClose();
            onMove();
          }}
        >
          Move
        </button>
        <button
          type="button"
          className="m-swipe__btn m-swipe__btn--delete"
          tabIndex={open ? 0 : -1}
          onClick={() => {
            onClose();
            onDelete();
          }}
        >
          Delete
        </button>
      </div>

      <div
        ref={bodyRef}
        className="m-swipe__body"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={settle}
        // While the pane is open the row is a dismiss target, not a link —
        // the same rule iOS uses, so the first tap never opens a sheet by
        // surprise.
        onClickCapture={(e) => {
          if (Date.now() < deadUntil.current) {
            deadUntil.current = 0;
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          if (!open) return;
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
      >
        {children}
      </div>
    </div>
  );
}
