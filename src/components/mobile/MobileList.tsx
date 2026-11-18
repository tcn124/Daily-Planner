import { useEffect, useRef, useState } from 'react';
import { usePlanner } from '../../store/plannerStore';
import { setDevicePrefs, useDevicePrefs } from '../../store/devicePrefs';
import { dayName, dayOfMonth, formatSpan, isWithin, todayISO } from '../../lib/dates';
import type { Item, RecurringItem } from '../../types';
import { ChevronDown } from '../icons';
import { MobileItemRow, MobileRecurringRow, subjectOf } from './MobileRows';
import { MissedRow } from './MissedRow';
import { SwipeRow } from './SwipeRow';
import { FilterSheet, type GroupBy, type ListView } from './FilterSheet';
import { useSheets, type ItemTarget } from './sheets';
import { useRowActions } from './rowActions';
import { useStickyHead } from './useStickyHead';

interface Props {
  /** Subjects shown; empty means all. Held by the shell, set from the Planner tab too. */
  subjectFilter: Set<string>;
  onFilter: (ids: Set<string>) => void;
  /* Held by the shell so they outlive a trip to another tab. */
  groupBy: GroupBy;
  onGroupBy: (g: GroupBy) => void;
  hideDone: boolean;
  onHideDone: (v: boolean) => void;
}

/** One thing in the list: an item on its day, or a span placed once. */
type Entry =
  | { kind: 'item'; item: Item; date: string }
  | { kind: 'recurring'; span: RecurringItem; date: string };

/**
 * The List tab (frame 4d).
 *
 * Spans running today sit together at the top as "Ongoing" rather than
 * repeating under every day they cover. Days before today fold into one
 * "Earlier" row you can open, so the list starts on today without throwing
 * the past away. Every row swipes like the Week's.
 */
export function MobileList({
  subjectFilter,
  onFilter,
  groupBy,
  onGroupBy,
  hideDone,
  onHideDone,
}: Props) {
  const { state } = usePlanner();
  const { subjects, items, recurring } = state;
  const { detailsVisible } = useDevicePrefs();
  const { openItem, openCompose } = useSheets();
  const { toggleDone, remove } = useRowActions();
  const headRef = useStickyHead<HTMLDivElement>();
  const [filterOpen, setFilterOpen] = useState(false);
  const [earlierOpen, setEarlierOpen] = useState(false);
  const [swiped, setSwiped] = useState<string | null>(null);

  const today = todayISO();

  /* ---- what passes the filters --------------------------------------- */

  function passes(subjectId: string | null, done: boolean, view: ListView): boolean {
    if (view.hideDone && done) return false;
    if (view.subjects.size === 0) return true;
    return subjectId !== null && view.subjects.has(subjectId);
  }

  const view: ListView = { subjects: subjectFilter, groupBy, hideDone, details: detailsVisible };

  function entriesFor(v: ListView): Entry[] {
    const fromItems: Entry[] = items
      .filter((i) => passes(i.subjectId, i.done, v))
      .map((i) => ({ kind: 'item', item: i, date: i.date }));
    // A span is placed once: on today if it is running, otherwise on its first day.
    const fromSpans: Entry[] = recurring
      .filter((r) => {
        const date = isWithin(today, r.startDate, r.endDate) ? today : r.startDate;
        return passes(r.subjectId, r.doneDates.includes(date), v);
      })
      .map((r) => ({
        kind: 'recurring',
        span: r,
        date: isWithin(today, r.startDate, r.endDate) ? today : r.startDate,
      }));
    return [...fromItems, ...fromSpans];
  }

  const entries = entriesFor(view);
  const ongoing = entries.filter(
    (e): e is Extract<Entry, { kind: 'recurring' }> =>
      e.kind === 'recurring' && isWithin(today, e.span.startDate, e.span.endDate),
  );
  const dated = entries.filter((e) => !ongoing.includes(e as never));

  const byDate = new Map<string, Entry[]>();
  for (const e of dated) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  const dates = [...byDate.keys()].sort();
  const earlier = dates.filter((d) => d < today);
  // Today is always listed, even with nothing on it, so the List always has
  // its bearings and an empty today says so rather than vanishing.
  const upcoming = [...new Set([today, ...dates.filter((d) => d >= today)])].sort();

  const sortDay = (list: Entry[]) =>
    list.slice().sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'item' ? -1 : 1;
      if (a.kind === 'item' && b.kind === 'item') {
        return Number(a.item.done) - Number(b.item.done) || a.item.createdAt - b.item.createdAt;
      }
      return 0;
    });

  const allDates = [...new Set([...items.map((i) => i.date), ...recurring.map((r) => r.startDate)])].sort();
  const earlierDone = earlier.reduce(
    (n, d) => n + (byDate.get(d) ?? []).filter((e) => e.kind === 'item' && e.item.done).length,
    0,
  );

  // Open on today rather than at the earliest day in the planner.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (groupBy !== 'day') return;
    bodyRef.current?.querySelector<HTMLElement>('[data-today]')?.scrollIntoView({ block: 'start' });
    // First open only; later renders must not yank the scroll position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- rows ----------------------------------------------------------- */

  function row(e: Entry, meta: 'day' | 'span' = 'span') {
    const key = e.kind === 'item' ? e.item.id : `${e.span.id}:${e.date}`;
    const target: ItemTarget =
      e.kind === 'item'
        ? { kind: 'item', id: e.item.id, date: e.date }
        : { kind: 'recurring', id: e.span.id, date: e.date };
    const done = e.kind === 'item' ? e.item.done : e.span.doneDates.includes(e.date);
    return (
      <SwipeRow
        key={key}
        enabled
        open={swiped === key}
        onOpen={() => setSwiped(key)}
        onClose={() => setSwiped(null)}
        doneLabel={done ? 'Undo' : 'Done'}
        onDone={() => toggleDone(target)}
        onMove={() => openItem(target)}
        onDelete={() => remove(target)}
      >
        {e.kind === 'item' ? (
          <MobileItemRow
            item={e.item}
            subject={subjectOf(subjects, e.item.subjectId)}
            showDetails={detailsVisible}
            onOpen={() => openItem(target)}
          />
        ) : (
          <MobileRecurringRow
            item={e.span}
            subject={subjectOf(subjects, e.span.subjectId)}
            date={e.date}
            meta={meta}
            onOpen={() => openItem(target)}
          />
        )}
      </SwipeRow>
    );
  }

  function daySection(date: string) {
    const list = sortDay(byDate.get(date) ?? []);
    const isToday = date === today;
    return (
      <section key={date} data-date={date} data-today={isToday || undefined}>
        <div className="m-dayhead" data-today={isToday}>
          <span className="m-dayhead__name">{dayName(date)}</span>
          <span className="m-dayhead__num">{dayOfMonth(date)}.</span>
          {isToday ? (
            <span className="m-dayhead__note">Today</span>
          ) : (
            <span className="m-dayhead__count">{list.length}</span>
          )}
        </div>
        <div className="m-rows">
          {isToday && list.length === 0 && (
            <div className="m-nothing m-nothing--today">
              <span>Nothing due today</span>
              <button type="button" className="m-textbtn"
                onClick={() => openCompose({ mode: 'new', date: today, band: 'assignment' })}>
                + Add
              </button>
            </div>
          )}
          {list.map((e) => row(e))}
        </div>
      </section>
    );
  }

  const shownLabel =
    subjectFilter.size === 0
      ? 'All subjects'
      : subjectFilter.size === 1
        ? (subjectOf(subjects, [...subjectFilter][0])?.name ?? 'No subjects')
        : `${subjectFilter.size} subjects`;

  // By day, today's own "Nothing due today" row stands in for an empty list.
  const nothing = entries.length === 0 && groupBy === 'subject';

  return (
    <>
      <div className="m-stickyhead" ref={headRef}>
        <div className="m-head">
          <div className="m-head__lead">
            <h1 className="m-head__title">List.</h1>
            <span className="m-head__sub">
              {allDates.length ? formatSpan([allDates[0], allDates[allDates.length - 1]]) : ''}
            </span>
          </div>
          <button type="button" className="m-filterpill" onClick={() => setFilterOpen(true)}>
            {shownLabel}
            <ChevronDown strokeWidth={1.3} />
          </button>
        </div>
        <MissedRow />
      </div>

      <div ref={bodyRef}>
        {nothing ? (
          <div className="m-empty">
            <span className="m-empty__title">Nothing here.</span>
            <p className="m-empty__note">
              {subjectFilter.size
                ? 'No items for these subjects.'
                : hideDone
                  ? 'Everything on the list is done.'
                  : 'Add an assignment with +, or import a syllabus from the desktop app.'}
            </p>
          </div>
        ) : groupBy === 'subject' ? (
          [...subjects, null].map((s) => {
            const id = s?.id ?? null;
            const list = entries
              .filter((e) => (e.kind === 'item' ? e.item.subjectId : e.span.subjectId) === id)
              .sort((a, b) => a.date.localeCompare(b.date));
            if (list.length === 0) return null;
            return (
              <section key={id ?? 'none'}>
                <div className="m-sec m-sec--sticky">
                  <span className="m-sec__title">{s?.name ?? 'No subject'}</span>
                  <span className="m-sec__count">{list.length}</span>
                </div>
                <div className="m-rows">{list.map((e) => row(e))}</div>
              </section>
            );
          })
        ) : (
          <>
            {ongoing.length > 0 && (
              <section>
                <div className="m-sec">
                  <span className="m-sec__title">Ongoing</span>
                  <span className="m-sec__count">{ongoing.length}</span>
                </div>
                <div className="m-rows">{ongoing.map((e) => row(e))}</div>
              </section>
            )}

            {earlier.length > 0 && (
              <>
                <button
                  type="button"
                  className="m-earlier"
                  aria-expanded={earlierOpen}
                  onClick={() => setEarlierOpen((o) => !o)}
                >
                  <span className="m-earlier__label">Earlier</span>
                  <span className="m-earlier__span">
                    {formatSpan([earlier[0], earlier[earlier.length - 1]])} · {earlierDone} done
                  </span>
                  <span className="m-earlier__caret" data-open={earlierOpen}>
                    <ChevronDown strokeWidth={1.3} />
                  </span>
                </button>
                {earlierOpen && earlier.map(daySection)}
              </>
            )}

            {upcoming.map(daySection)}
          </>
        )}
      </div>

      {filterOpen && (
        <FilterSheet
          subjects={subjects}
          countFor={(id) =>
            items.filter((i) => i.subjectId === id).length +
            recurring.filter((r) => r.subjectId === id).length
          }
          countWith={(v) => entriesFor(v).length}
          value={view}
          onApply={(v) => {
            onFilter(v.subjects);
            onGroupBy(v.groupBy);
            onHideDone(v.hideDone);
            if (v.details !== detailsVisible) setDevicePrefs({ detailsVisible: v.details });
          }}
          onClose={() => setFilterOpen(false)}
        />
      )}
    </>
  );
}
