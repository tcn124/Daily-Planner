import { subjectAccent } from '../lib/color';

interface Props {
  hue: number | null;
  /** Drawn at half strength — a done item keeps its colour but recedes. */
  dim?: boolean;
  /** Overrides the 9px default (the phone's cards use 7). */
  size?: number;
  className?: string;
}

/**
 * The subject's colour as a small square. The redesign shrinks subject colour
 * to this one mark everywhere so the page itself stays two-tone; the subject's
 * name, where shown, is set beside it in the serif.
 */
export function SubjectSquare({ hue, dim, size, className }: Props) {
  return (
    <span
      className={['square', className].filter(Boolean).join(' ')}
      data-dim={dim || undefined}
      aria-hidden="true"
      style={{
        background: subjectAccent(hue),
        ...(size ? { width: size, height: size } : null),
      }}
    />
  );
}
