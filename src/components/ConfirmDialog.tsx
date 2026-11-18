import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  /** The question, set in the serif ("Delete History?"). */
  title?: string;
  /** What it will do. When there is no title, this is shown as the title. */
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onResolve: (ok: boolean) => void;
}

/**
 * In-app replacement for `window.confirm`, which cannot be relied on here:
 * embedded webviews suppress it (it returns false without ever showing), and
 * Tauri's WebView returns true without showing — so the native primitive
 * either defeats every guard or silently bypasses it, depending on the host.
 *
 * Portaled to `body` so it always lands above whatever opened it — the phone's
 * sheets are portaled there too, and an in-place dialog painted underneath
 * the sheet that asked the question.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  onResolve,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  return createPortal(
    <div
      className="confirm__scrim"
      role="alertdialog"
      aria-modal="true"
      aria-label={title ?? message}
      onClick={() => onResolve(false)}
      onKeyDown={(e) => {
        // Stop here so the surrounding panel doesn't also close on Escape.
        e.stopPropagation();
        if (e.key === 'Escape') onResolve(false);
        if (e.key === 'Enter') onResolve(true);
      }}
    >
      <div className="confirm" onClick={(e) => e.stopPropagation()}>
        <div className="confirm__body">
          <h2 className="confirm__title">{title ?? message}</h2>
          {title && <p className="confirm__message">{message}</p>}
        </div>
        <div className="confirm__actions">
          <button type="button" className="confirm__btn" onClick={() => onResolve(false)}>
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="confirm__btn confirm__btn--go"
            data-danger={danger || undefined}
            onClick={() => onResolve(true)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
