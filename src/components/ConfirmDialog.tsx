import { useEffect, useRef } from 'react';

interface Props {
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
 */
export function ConfirmDialog({
  message,
  confirmLabel = 'Confirm',
  danger = false,
  onResolve,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  return (
    <div
      className="confirm__scrim"
      role="dialog"
      aria-modal="true"
      aria-label={message}
      onClick={() => onResolve(false)}
      onKeyDown={(e) => {
        // Stop here so the surrounding panel doesn't also close on Escape.
        e.stopPropagation();
        if (e.key === 'Escape') onResolve(false);
        if (e.key === 'Enter') onResolve(true);
      }}
    >
      <div className="confirm" onClick={(e) => e.stopPropagation()}>
        <p className="confirm__message">{message}</p>
        <div className="confirm__actions">
          <button
            ref={confirmRef}
            type="button"
            className={danger ? 'btn btn--danger' : 'btn btn--primary'}
            onClick={() => onResolve(true)}
          >
            {confirmLabel}
          </button>
          <button type="button" className="btn" onClick={() => onResolve(false)}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
