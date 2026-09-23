import { useEffect, useRef } from 'react';

/**
 * Pins a tab's header block to the top of its scrolling pane.
 *
 * The header is one sticky element rather than several, because several would
 * each stick at `top: 0` and stack on top of each other. Wrapping them means
 * the masthead, the strip and the day row keep their own spacing and travel as
 * the single shelf they read as.
 *
 * Its height is published as `--m-sticky-h` on the pane, because two things
 * below need to know it: the List's day headers, which stick *under* this one
 * rather than at the top, and anything scrolled into view, which would
 * otherwise land behind it. The height is not a constant — the month masthead
 * scales with the viewport and the column headers only exist at two and three
 * days — so it is measured rather than written down.
 */
export function useStickyHead<T extends HTMLElement>(): React.RefObject<T> {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    const pane = el?.closest<HTMLElement>('.m-pane');
    if (!el || !pane) return;

    const measure = () => {
      pane.style.setProperty('--m-sticky-h', `${Math.round(el.getBoundingClientRect().height)}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);

    // The shelf only casts a shadow once there is something underneath it; at
    // rest its lower border is the next band's own, and two would read as one
    // thick line.
    const onScroll = () => {
      el.dataset.stuck = pane.scrollTop > 0 ? 'true' : 'false';
    };
    onScroll();
    pane.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      observer.disconnect();
      pane.removeEventListener('scroll', onScroll);
      pane.style.removeProperty('--m-sticky-h');
    };
  }, []);

  return ref;
}
