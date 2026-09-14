import { useEffect, useRef, useState } from 'react';

interface Props {
  /** Which divider this is: 0 = Assignments/Events, 1 = Events/Recurring. */
  index: number;
  bandWeights: [number, number, number];
  onBands: (weights: [number, number, number]) => void;
  onReset: () => void;
}

/** A band never shrinks below this share of its pair's combined weight. */
const MIN_SHARE = 0.15;

interface Drag {
  startY: number;
  /** Combined pixel height of the two bands being divided. */
  trackPx: number;
  before: number;
  after: number;
}

/**
 * The grab strip for one band divider. It sits on the top edge of a band's
 * section header, so the two bands it divides are the header's immediate
 * siblings: the band above is the previous element, the band below the next.
 * Either can be absent when that band is collapsed, in which case there is
 * nothing to resize.
 */
function bandsAround(el: HTMLElement | null): [Element, Element] | null {
  const head = el?.closest('.bandhead');
  const above = head?.previousElementSibling;
  const below = head?.nextElementSibling;
  if (!above?.classList.contains('band') || !below?.classList.contains('band')) {
    return null;
  }
  return [above, below];
}
export function BandResizer({ index, bandWeights, onBands, onReset }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  useEffect(() => {
    if (!drag) return;
    const active = drag;

    function onMove(e: globalThis.MouseEvent) {
      const pair = active.before + active.after;
      let delta = ((e.clientY - active.startY) * pair) / active.trackPx;

      // Clamp so neither band collapses.
      const min = pair * MIN_SHARE;
      delta = Math.max(min - active.before, Math.min(active.after - min, delta));

      const next = [...bandWeights] as [number, number, number];
      next[index] = active.before + delta;
      next[index + 1] = active.after - delta;
      onBands(next);
    }

    const onUp = () => setDrag(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.classList.add('is-band-resizing');
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.classList.remove('is-band-resizing');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, bandWeights, index]);

  return (
    <span
      ref={ref}
      className="band-resizer"
      title="Drag to resize · double-click to reset"
      onMouseDown={(e) => {
        const pair = bandsAround(ref.current);
        if (!pair) return;
        const [above, below] = pair;
        e.preventDefault();
        setDrag({
          startY: e.clientY,
          trackPx:
            above.getBoundingClientRect().height +
            below.getBoundingClientRect().height,
          before: bandWeights[index],
          after: bandWeights[index + 1],
        });
      }}
      onDoubleClick={(e) => {
        e.preventDefault();
        onReset();
      }}
    />
  );
}
