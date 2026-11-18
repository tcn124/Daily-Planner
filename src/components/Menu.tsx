import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from './icons';

interface Props {
  /** Quiet prefix before the trigger, e.g. "Show". */
  prefix?: string;
  /** The trigger's own text, e.g. "All subjects". */
  label: string;
  /** Called with a `close` function so an item can dismiss the menu. */
  children: (close: () => void) => ReactNode;
}

/**
 * A text trigger with a chevron that opens a small white list below it — the
 * List header's "Show All subjects ▾" from frame 2d. Closes on an outside
 * press or Escape, like the composer does.
 */
export function Menu({ prefix, label, children }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && e.target instanceof Node && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu" ref={rootRef}>
      {prefix && <span className="viewbar__muted">{prefix}</span>}
      <button
        type="button"
        className="link menu__trigger"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
        <ChevronDown />
      </button>
      {open && <div className="menu__list">{children(() => setOpen(false))}</div>}
    </div>
  );
}

interface ItemProps {
  checked?: boolean;
  onSelect: () => void;
  children: ReactNode;
}

export function MenuItem({ checked, onSelect, children }: ItemProps) {
  return (
    <button
      type="button"
      className="menu__item"
      role="menuitemcheckbox"
      aria-checked={!!checked}
      onClick={onSelect}
    >
      <span className="menu__check" aria-hidden="true">{checked ? '✓' : ''}</span>
      {children}
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <span className="menu__label">{children}</span>;
}
