import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { usePlanner } from '../store/plannerStore';
import {
  addDays,
  buildWindow,
  dayName,
  dayOfMonth,
  isWeekend,
  isWithin,
  todayISO,
} from '../lib/dates';
import { DEFAULT_BAND_WEIGHTS, uid } from '../store/defaults';
import {
  setAnchor,
  setBandWeights,
  shiftAnchor,
  useDevicePrefs,
} from '../store/devicePrefs';
import { DayCell, type ComposerTarget } from './DayCell';
import { RecurringBand } from './RecurringBand';
import { TodoStrip } from './TodoStrip';
import type { ComposerValue } from './ItemComposer';
import { WeekBar } from './WeekBar';
import { BandHeader } from './BandHeader';
import { pad2 } from '../lib/format';

interface Props {
  /** The top bar's content slot; the week's controls render into it. */
  slot: HTMLElement | null;
  onOpenDay: (date: string) => void;
}

type BandKey = 'assignments' | 'recurring';

/**
 * Days rendered off-screen either side of the visible window, so sideways
 * scrolling has somewhere to go before the anchor is re-based.
 *
 * The re-base only runs once a scroll fully comes to rest (see `settle`
 * below), so this has to cover the whole distance a single fast flick or an
 * unbroken run of trackpad scrolling can travel before that happens — not
 * just a comfortable margin at rest. Too small and a fast scroll outruns the
 * rendered track, exposing blank space past the last real column. Day cells
 * are cheap (mostly empty), so a generous buffer costs little.
 */
const BUFFER = 30;

/**
 * Fallback only, for engines without `scrollend`: how long the scroll must be
 * quiet before we treat the gesture as finished. Where `scrollend` exists the
 * browser tells us the exact moment, guess-free.
 */
const SETTLE_FALLBACK_MS = 100;

const HAS_SCROLLEND = typeof window !== 'undefined' && 'onscrollend' in window;

export function WeekView({ slot, onOpenDay }: Props) {
  const { state, dispatch } = usePlanner();
  const { subjects, items, recurring, todos } = state;
  const settings = useDevicePrefs();
  const [composer, setComposer] = useState<ComposerTarget | null>(null);
  const [collapsed, setCollapsed] = useState<Record<BandKey, boolean>>({
    assignments: false,
    recurring: false,
  });

  const today = todayISO();

  // What the user is meant to be looking at — drives counts and the header.
  const window_ = buildWindow(settings.anchorDate, settings.daysVisible);
  // What is actually in the DOM: the visible window plus a buffer either side.
  const trackStart = addDays(settings.anchorDate, -BUFFER);
  const totalDays = settings.daysVisible + BUFFER * 2;
  const trackWindow = buildWindow(trackStart, totalDays);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const settleRef = useRef<number | undefined>(undefined);
  /** Scroll/scrollend events before this timestamp are ones we caused by re-parking. */
  const ignoreScrollUntil = useRef(0);
  /**
   * The dates currently in the DOM, kept fresh every render. The settle handler
   * reads the resting day out of this rather than doing arithmetic on
   * `settings.anchorDate`, which by then may be a render behind.
   */
  const trackRef = useRef(trackWindow);
  trackRef.current = trackWindow;

  const columnWidth = () => {
    const el = scrollerRef.current;
    return el ? el.clientWidth / settings.daysVisible : 0;
  };

  /**
   * Park the viewport on the anchor day after any anchor change, so the
   * rendered window slides under a stationary viewport and the re-base is
   * invisible.
   *
   * Setting `scrollLeft` fires scroll and scrollend events of our own making.
   * Left alone they would trigger a settle, and a burst of arrow presses would
   * then re-anchor from whatever the settle happened to see — which skipped and
   * reversed days. So: drop any pending settle, and ignore events for a moment
   * after. Those events land within a frame, so the window is kept short.
   */
  const parkedOnce = useRef(false);
  /**
   * The column width the current park was made at. `scrollLeft` is in pixels,
   * so it only means "the anchor is leftmost" at this width — see
   * `widthChanged`.
   */
  const parkedWidth = useRef(0);
  const repark = (quietMs: number) => {
    const el = scrollerRef.current;
    const w = columnWidth();
    if (!el || !w) return;
    window.clearTimeout(settleRef.current);
    parkedWidth.current = w;
    ignoreScrollUntil.current = performance.now() + quietMs;
    const target = BUFFER * w;
    if (Math.abs(el.scrollLeft - target) >= 1) el.scrollLeft = target;
  };
  const reparkRef = useRef(repark);
  reparkRef.current = repark;

  useLayoutEffect(() => {
    // On a page reload the browser may restore a stale scroll position a frame
    // or two after we first park, and a settle would then honour it. Give the
    // first park a longer quiet window and re-assert it once layout is stable.
    const first = !parkedOnce.current;
    parkedOnce.current = true;
    repark(first ? 400 : 120);
    if (first) {
      requestAnimationFrame(() => requestAnimationFrame(() => reparkRef.current(400)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.anchorDate, settings.daysVisible]);

  /** True when the columns are no longer the width the last park was made at. */
  const widthChanged = () => Math.abs(columnWidth() - parkedWidth.current) > 0.5;

  /**
   * Zooming (⌘+ / ⌘−), resizing the window and collapsing the sidebar all
   * change the column width while `scrollLeft` keeps its old pixel value — so
   * the same offset now lands on a different day, and the next settle would
   * re-anchor there: zooming to 125% used to jump the week six days back. The
   * anchor is still right; only the pixels are stale. So re-park on any width
   * change, which keeps the same day in the same column at the new size.
   */
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (widthChangedRef.current()) reparkRef.current(120);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const widthChangedRef = useRef(widthChanged);
  widthChangedRef.current = widthChanged;

  useEffect(() => () => window.clearTimeout(settleRef.current), []);

  /**
   * A card mid-drag pins the grid: re-anchoring would slide the days under the
   * cursor and change which cell is about to receive the drop.
   */
  const draggingRef = useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  /**
   * CSS scroll-snap does the snapping; this only re-bases the anchor to
   * whichever day came to rest on the left once the gesture is over.
   */
  const settle = () => {
    if (draggingRef.current !== null) return;
    if (performance.now() < ignoreScrollUntil.current) return;
    const el = scrollerRef.current;
    const w = columnWidth();
    if (!el || !w) return;
    // The browser fires scroll events for a relayout before ResizeObserver
    // reports it, so a settle can see the new width against the old offset.
    // That is not the user scrolling — put the anchor back where it was.
    if (widthChanged()) {
      repark(120);
      return;
    }
    const column = Math.round(el.scrollLeft / w);
    if (column === BUFFER) return;
    // Absolute, not relative: read the date actually sitting in that column.
    const next = trackRef.current[column];
    if (next) setAnchor(next);
  };
  const settleRefFn = useRef(settle);
  settleRefFn.current = settle;

  /**
   * `scrollend` fires the instant all motion — momentum and snap included — is
   * done. A timeout can only guess at that, and on a trackpad flick momentum
   * briefly pauses mid-gesture, so the guess fires early and re-parks a scroll
   * that is still in flight. React 18 has no `onScrollEnd`, hence the native
   * listener.
   */
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !HAS_SCROLLEND) return;
    const onEnd = () => settleRefFn.current();
    el.addEventListener('scrollend', onEnd);
    return () => el.removeEventListener('scrollend', onEnd);
  }, []);

  /**
   * A trackpad gesture latches to whatever it first tries to scroll, for as
   * long as the fingers are down. Every cell is a vertical scroller, so a
   * swipe that starts even slightly downward latches to the cell (or, if it
   * can't scroll, the page), and the sideways motion that follows goes
   * nowhere — the week feels stuck until the gesture is restarted.
   *
   * So vertical wheel motion is cancelled before WebKit sees it, unless the
   * cursor is over a cell whose contents really do overflow. A cancelled event
   * never latches, and the gesture is free to become a sideways one. Native
   * scrolling and the snap points stay in charge of everything horizontal.
   * Passive must be false or `preventDefault` is ignored.
   */
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const target = e.target as HTMLElement | null;
      // The composer's fields have their own scrolling; leave them alone.
      if (target?.closest('.composer, textarea, select')) return;
      const column = target?.closest<HTMLElement>('.cell, .rec-track');
      if (column && column.scrollHeight > column.clientHeight + 1) return;
      e.preventDefault();
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  function onScroll() {
    if (HAS_SCROLLEND) return;
    if (performance.now() < ignoreScrollUntil.current) return;
    window.clearTimeout(settleRef.current);
    settleRef.current = window.setTimeout(
      () => settleRefFn.current(),
      SETTLE_FALLBACK_MS,
    );
  }

  // Arrow keys page the window, but not while typing into the composer.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === 'ArrowLeft') shiftAnchor(-1);
      if (e.key === 'ArrowRight') shiftAnchor(1);
      if (e.key === 'Escape') setComposer(null);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dispatch]);

  function createSubject(name: string, hue: number | null): string {
    const id = uid();
    dispatch({ type: 'subject/add', name, hue, id });
    return id;
  }

  function submitComposer(value: ComposerValue) {
    if (!composer) return;
    if (composer.itemId) {
      dispatch({ type: 'item/update', id: composer.itemId, patch: value });
    } else {
      dispatch({
        type: 'item/add',
        item: { date: composer.date, done: false, ...value },
      });
    }
    setComposer(null);
  }

  function onDragStart(id: string) {
    draggingRef.current = id;
    setDraggingId(id);
  }

  function finishDrag() {
    draggingRef.current = null;
    setDraggingId(null);
    // Dragging near an edge may have auto-scrolled the grid; catch up now.
    settleRefFn.current();
  }

  /**
   * Cleanup happens here, not only in `onDragEnd`. A successful drop moves the
   * item to another cell, so React unmounts the original card — and the
   * browser then fires `dragend` on that detached element, where it never
   * reaches React. Relying on it left the moved card stuck in its faded
   * "being dragged" state.
   */
  function onDropItem(id: string, date: string) {
    finishDrag();
    const item = items.find((i) => i.id === id);
    // Only the day moves. An item stored as an event stays one: the UI no
    // longer draws events apart, but other devices and backups still read it.
    if (!item || item.date === date) return;
    dispatch({ type: 'item/update', id, patch: { date } });
  }

  /** Still needed for drags that end without a drop — cancelled, or released off-grid. */
  const onDragEnd = finishDrag;

  const cellProps = {
    subjects,
    composer,
    draggingId,
    onOpenComposer: setComposer,
    onCloseComposer: () => setComposer(null),
    onSubmit: submitComposer,
    onToggle: (id: string) => dispatch({ type: 'item/toggle', id }),
    onDelete: (id: string) => dispatch({ type: 'item/delete', id }),
    onCreateSubject: createSubject,
    onDragStart,
    onDragEnd,
    onDropItem,
  };

  /*
   * Events are folded in with assignments: the redesign draws one band of
   * things due. The stored type is left alone (see `onDropItem`).
   */
  const itemsFor = (date: string) =>
    items.filter((i) => i.date === date).sort((a, b) => a.createdAt - b.createdAt);

  const inWindow = (date: string) => window_.includes(date);
  const dueCount = items.filter((i) => !i.done && inWindow(i.date)).length;
  const activeCount = recurring.filter((r) =>
    window_.some((d) => isWithin(d, r.startDate, r.endDate)),
  ).length;

  const toggleBand = (key: BandKey) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  const resizerFor = (index: number) => ({
    index,
    bandWeights: settings.bandWeights,
    onBands: setBandWeights,
    onReset: () => setBandWeights([...DEFAULT_BAND_WEIGHTS] as [number, number, number]),
  });

  /** A collapsed band keeps its stored weight but takes no space. */
  const bandStyle = (index: number, key: BandKey) =>
    collapsed[key] ? undefined : { flex: `${settings.bandWeights[index]} 1 0` };

  /**
   * True for columns sitting in the right-hand third of the visible window,
   * where a left-anchored popover would run off screen. Indices are into the
   * buffered track, so the visible window starts at BUFFER.
   */
  function flipsComposer(trackIndex: number) {
    const visible = trackIndex - BUFFER;
    return visible >= settings.daysVisible - 3 && visible < settings.daysVisible;
  }

  return (
    <div
      className="planner"
      style={
        {
          '--days': settings.daysVisible,
          '--total-days': totalDays,
          '--track-w': `${(totalDays / settings.daysVisible) * 100}%`,
        } as CSSProperties
      }
    >
      {slot &&
        createPortal(
          <WeekBar
            window={window_}
            onNewItem={() =>
              setComposer({
                date: window_.includes(today) ? today : window_[0],
                type: 'assignment',
                itemId: null,
              })
            }
          />,
          slot,
        )}

      <div className="dayscroll" ref={scrollerRef} onScroll={onScroll}>
      <div className="dayhead">
        {trackWindow.map((date, i) => {
          const classes = ['dayhead__day'];
          if (isWeekend(date)) classes.push('dayhead__day--weekend');
          if (date === today) classes.push('dayhead__day--today');
          return (
            <button
              /*
               * Keyed by position, not by date: on a big fast scroll the
               * anchor can rebase by dozens of days at once, changing nearly
               * every date in this window in one render. Keying by date made
               * React tear down and recreate almost every column simultaneously
               * (plus reorder whichever survived) right as `scrollLeft` snapped
               * back — enough synchronous DOM work in one frame that WKWebView
               * would drop the repaint and leave a stuck blank area. Keying by
               * slot means a rebase just updates each column's content in
               * place, however far the anchor moves.
               */
              key={i}
              type="button"
              className={classes.join(' ')}
              title={`Open ${dayName(date)}`}
              onClick={() => onOpenDay(date)}
            >
              <span className="dayhead__name">{dayName(date).slice(0, 3)}</span>
              <span className="dayhead__date">
                {dayOfMonth(date)}
                {date === today ? '.' : ''}
              </span>
              {date === today && <span className="dayhead__pill">Today</span>}
            </button>
          );
        })}
      </div>

      <BandHeader
        label="Assignments"
        count={pad2(dueCount)}
        collapsed={collapsed.assignments}
        onToggleCollapsed={() => toggleBand('assignments')}
      />
      {!collapsed.assignments && (
        <div className="band band--assignments" style={bandStyle(0, 'assignments')}>
          {trackWindow.map((date, i) => (
            <DayCell
              key={i}
              date={date}
              type="assignment"
              tinted={date === today}
              flipComposer={flipsComposer(i)}
              items={itemsFor(date)}
              {...cellProps}
            />
          ))}
        </div>
      )}

      <BandHeader
        label="Recurring"
        count={pad2(activeCount)}
        collapsed={collapsed.recurring}
        onToggleCollapsed={() => toggleBand('recurring')}
        resizer={resizerFor(0)}
      />
      {!collapsed.recurring && (
        <div className="band band--recurring" style={bandStyle(1, 'recurring')}>
          <RecurringBand
            anchorDate={trackStart}
            days={totalDays}
            recurring={recurring}
            subjects={subjects}
            onCreate={(item) => dispatch({ type: 'recurring/add', item })}
            onUpdate={(id, patch) => dispatch({ type: 'recurring/update', id, patch })}
            onDelete={(id) => dispatch({ type: 'recurring/delete', id })}
            onToggleDay={(id, date) => dispatch({ type: 'recurring/toggleDay', id, date })}
            onCreateSubject={createSubject}
          />
        </div>
      )}
      </div>

      <TodoStrip
        todos={todos}
        onAddTodo={(text) => dispatch({ type: 'todo/add', text })}
        onToggleTodo={(id) => dispatch({ type: 'todo/toggle', id })}
        onDeleteTodo={(id) => dispatch({ type: 'todo/delete', id })}
      />
    </div>
  );
}
