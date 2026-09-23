import { useEffect, useRef, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * The phone's one modal surface.
 *
 * There is no nested navigation anywhere in the design: everything that is not
 * one of the three tabs is a sheet over them. So this is the only chrome that
 * needs to exist, and every sheet below it is a body of fields inside this
 * frame.
 *
 * Three things it has to get right. It comes up from the bottom, so a thumb
 * can reach the dismiss. It can be flung away, because reaching the header is
 * a stretch on a large phone. And its affirmative action sits in the *header* —
 * the keyboard covers the bottom third of the screen, which is exactly where a
 * form's submit button would otherwise be.
 */

interface SheetAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

interface Props {
  title: string;
  /** A date, a span, a count — whatever names the thing being edited. */
  subtitle?: string;
  /** "Cancel" where there is unsaved work to lose, "Close" where there is not. */
  closeLabel?: string;
  /** The header's right-hand button: Add, Save. */
  action?: SheetAction;
  onClose: () => void;
  children: ReactNode;
}

/** Everything Tab can land on. Filtered by visibility at the point of use. */
const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/** Past this much downward travel, letting go dismisses rather than springs back. */
const DISMISS_AT = 90;

export function Sheet({ title, subtitle, closeLabel = 'Close', action, onClose, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);

  /*
   * Focus moves into the sheet and comes back to whatever opened it. The panel
   * itself takes focus rather than the first field, so opening a sheet does not
   * throw the keyboard up over the content you came to read — a sheet that
   * wants a field focused does that itself.
   */
  useEffect(() => {
    const restore = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => restore?.focus?.();
  }, []);

  /* The pane behind is still a scroller; stop it moving under the scrim. */
  useEffect(() => {
    document.body.classList.add('m-locked');
    return () => document.body.classList.remove('m-locked');
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      // Stops here: an Escape meant for the sheet must not also reach the view.
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;
    const nodes = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (n) => n.offsetParent !== null,
    );
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /* ---- drag to dismiss ---------------------------------------------- */

  /*
   * Driven by writing the transform straight to the node. Putting the offset in
   * React state would re-render every field in the sheet on every frame of the
   * drag, which on a phone is the difference between following the finger and
   * lagging behind it.
   */
  function onGrabDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current = { y: e.clientY, dy: 0 };
    const panel = panelRef.current;
    if (panel) panel.style.transition = 'none';
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onGrabMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const panel = panelRef.current;
    if (!d || !panel) return;
    // Downward only. A sheet cannot be dragged taller than it is.
    d.dy = Math.max(0, e.clientY - d.y);
    panel.style.transform = `translateY(${d.dy}px)`;
  }

  function onGrabUp() {
    const d = drag.current;
    const panel = panelRef.current;
    drag.current = null;
    if (!d || !panel) return;
    panel.style.transition = '';
    panel.style.transform = '';
    if (d.dy > DISMISS_AT) onClose();
  }

  return createPortal(
    <div
      className="m-sheet__scrim"
      // Click, not pointerdown: a drag that starts on a field and is released
      // out here is a text selection, not a dismiss.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="m-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div
          className="m-sheet__grab"
          onPointerDown={onGrabDown}
          onPointerMove={onGrabMove}
          onPointerUp={onGrabUp}
          onPointerCancel={onGrabUp}
        >
          <span className="m-sheet__grabber" aria-hidden="true" />
        </div>

        <div className="m-sheet__head">
          <button type="button" className="m-sheet__close" onClick={onClose}>
            {closeLabel}
          </button>
          <span className="m-sheet__titles">
            <span className="m-sheet__title">{title}</span>
            {subtitle && <span className="m-sheet__sub">{subtitle}</span>}
          </span>
          {action ? (
            <button
              type="button"
              className="m-sheet__action"
              disabled={action.disabled}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ) : (
            <span className="m-sheet__action m-sheet__action--empty" aria-hidden="true" />
          )}
        </div>

        <div className="m-sheet__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/* ---- pieces the sheets share ---------------------------------------- */

/** A labelled field. The label is 11px above, as in the desktop composer. */
export function SheetField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="m-field">
      <span className="m-field__label">{label}</span>
      {children}
    </label>
  );
}

/** A group of rows on the sunken field, the way the Planner tab reads. */
export function SheetGroup({
  label,
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <>
      {label && <span className="m-sheet__eyebrow">{label}</span>}
      <div className="m-sheet__group">{children}</div>
    </>
  );
}
