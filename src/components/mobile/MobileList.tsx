import { useEffect, useRef } from 'react';
import { usePlanner } from '../../store/plannerStore';
import { setDevicePrefs, useDevicePrefs } from '../../store/devicePrefs';
import { activeDates, rowsForDate, type ListRow } from '../../lib/listRows';
import { dayName, dayOfMonth, daysBetween, monthShort, todayISO } from '../../lib/dates';
import { spanDates } from '../../lib/recurring';
import { MobileCheckbox, MobileChip, subjectOf } from './MobileRows';
import { useSheets } from './sheets';
import { useStickyHead } from './useStickyHead';
import type { Subject } from '../../types';

type GroupBy = 'day' | 'subject';

interface Props {
  /** Set from the Planner tab; narrows the list to one subject. */
  subjectFilter: string | null;
  onClearFilter: () => void;
  /* Held by the shell so they outlive a trip to another tab. */
  groupBy: GroupBy;
  onGroupBy: (g: GroupBy) => void;
  hideDone: boolean;
  onHideDone: (v: boolean) => void;
}

interface Section {
  key: string;
  title: string;
  /** Day number for the badge; blank when grouped by subject. */
  badge: string;
  isToday: boolean;
  rows: ListRow[];
}

/** "Event · 2:00 pm", "Recurring · day 2 of 3", "11:59 pm", "Done". */
function metaFor(row: ListRow, recurringSpan: (id: string) => number, offset: (id: string) => number): string {
  if (row.done) return 'Done';
  if (row.kind === 'recurring') {
    return `Recurring · day ${offset(row.id)} of ${recurringSpan(row.id)}`;
  }
  if (row.kind === 'event') return row.time ? `Event · ${row.time}` : 'Event';
  return row.time;
}

/**
 * The desktop's four-column row, restacked into one column: title, then
 * details, then subject and meta. Day headers stick while scrolling so it is
 * always clear which day is on screen.
 */
export function MobileList({
  subjectFilter,
  onClearFilter,
  groupBy,
  onGroupBy,
  hideDone,
  onHideDone,
}: Props) {
  const { state, dispatch } = usePlanner();
  const { subjects, items, recurring } = state;
  const { detailsVisible } = useDevicePrefs();
  const { openItem, openCompose } = useSheets();
  /* Title, grouping and the two toggles stay put; the sections scroll under. */
  const headRef = useStickyHead<HTMLDivElement>();

  const today = todayISO();
  const dates = activeDates(items, recurring);

  const spanLength = (id: string) => {
    const r = recurring.find((x) => x.id === id);
    return r ? spanDates(r).length : 0;
  };
  const dayOffset = (id: string, date: string) => {
    const r = recurring.find((x) => x.id === id);
    return r ? daysBetween(r.startDate, date) + 1 : 0;
  };

  function visible(rows: ListRow[]): ListRow[] {
    return rows.filter(
      (r) =>
        (!hideDone || !r.done) &&
        (subjectFilter === null || r.subjectId === subjectFilter),
    );
  }

  const allRows = dates.flatMap((d) => rowsForDate(d, items, recurring, subjects));

  const sections: Section[] =
    groupBy === 'day'
      ? dates
          .map((date) => ({
            key: date,
            title: dayName(date),
            badge: dayOfMonth(date),
            isToday: date === today,
            rows: visible(rowsForDate(date, items, recurring, subjects)),
          }))
          .filter((s) => s.rows.length > 0)
      : [...subjects, null as Subject | null]
          .map((s) => ({
            key: s?.id ?? 'none',
            title: s?.name ?? 'No subject',
            badge: '',
            isToday: false,
            rows: visible(allRows.filter((r) => r.subjectId === (s?.id ?? null))),
          }))
          .filter((s) => s.rows.length > 0);

  const count = sections.reduce((n, s) => n + s.rows.length, 0);

  // Open on today rather than at the earliest day in the planner.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (groupBy !== 'day') return;
    const target = dates.find((d) => d >= today);
    if (!target) return;
    bodyRef.current
      ?.querySelector<HTMLElement>(`[data-date="${target}"]`)
      ?.scrollIntoView({ block: 'start' });
    // First open only; later renders must not yank the scroll position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(row: ListRow) {
    dispatch(
      row.kind === 'recurring'
        ? { type: 'recurring/toggleDay', id: row.id, date: row.date }
        : { type: 'item/toggle', id: row.id },
    );
  }

  const filterName = subjectFilter
    ? (subjectOf(subjects, subjectFilter)?.name ?? 'Subject')
    : null;

  return (
    <>
      {/*
        The masthead and its controls are one pinned shelf. Hide done and the
        grouping change what you are looking at, so they have to stay in reach
        of the part of the list you have scrolled to.
      */}
      <div className="m-stickyhead" ref={headRef}>
        <div className="m-head">
          <div className="m-head__stack">
            <span className="m-head__eyebrow">
              {filterName ?? 'All upcoming'} · {count} {count === 1 ? 'item' : 'items'}
              {filterName && (
                <button type="button" className="m-head__clear" onClick={onClearFilter}>
                  Clear
                </button>
              )}
            </span>
            <h1 className="m-head__title m-head__title--short">List</h1>
          </div>
          {/* The List is not looking at a particular day, so a new item lands on
              today — the composer's date field is right there to change it. */}
          <button
            type="button"
            className="m-plus"
            aria-label="New item"
            onClick={() => openCompose({ mode: 'new', date: today, band: 'assignment' })}
          >
            +
          </button>
        </div>

        <div className="m-listctl">
          <div className="m-seg" role="group" aria-label="Group by">
            {(['day', 'subject'] as GroupBy[]).map((g) => (
              <button
                key={g}
                type="button"
                className="m-seg__opt"
                data-active={groupBy === g}
                aria-pressed={groupBy === g}
                onClick={() => onGroupBy(g)}
              >
                {g === 'day' ? 'Day' : 'Subject'}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="m-toggle m-toggle--wide"
            data-on={hideDone}
            aria-pressed={hideDone}
            onClick={() => onHideDone(!hideDone)}
          >
            Hide done
          </button>
          <button
            type="button"
            className="m-toggle m-toggle--wide"
            data-on={detailsVisible}
            aria-pressed={detailsVisible}
            onClick={() => setDevicePrefs({ detailsVisible: !detailsVisible })}
          >
            Details
          </button>
        </div>
      </div>

      <div ref={bodyRef}>
        {sections.map((section) => (
          <section key={section.key} data-date={groupBy === 'day' ? section.key : undefined}>
            <div className="m-group" data-today={section.isToday}>
              <span className="m-group__title">{section.title}</span>
              {section.badge && (
                <span className="m-group__badge" data-today={section.isToday}>
                  {groupBy === 'day' ? `${monthShort(section.key)} ${section.badge}` : section.badge}
                </span>
              )}
              {section.isToday && <span className="m-group__note">today</span>}
              <span className="m-group__count">{section.rows.length}</span>
            </div>

            {section.rows.map((row) => (
              <div key={`${row.id}-${row.date}`} className="m-row" data-done={row.done}>
                <button
                  type="button"
                  className="m-row__body"
                  onClick={() =>
                    openItem({
                      kind: row.kind === 'recurring' ? 'recurring' : 'item',
                      id: row.id,
                      date: row.date,
                    })
                  }
                >
                  <span className="m-row__title">{row.desc}</span>
                  {detailsVisible && row.details && (
                    <span className="m-row__details">{row.details}</span>
                  )}
                  <span className="m-row__meta">
                    <MobileChip subject={subjectOf(subjects, row.subjectId)} done={row.done} />
                    <span className="m-row__time">
                      {metaFor(
                        row,
                        (id) => spanLength(id),
                        (id) => dayOffset(id, row.date),
                      )}
                    </span>
                  </span>
                </button>
                <div className="m-row__check">
                  <MobileCheckbox
                    done={row.done}
                    label={row.done ? 'Mark as not done' : 'Mark as done'}
                    onToggle={() => toggle(row)}
                  />
                </div>
              </div>
            ))}
          </section>
        ))}

        {count === 0 && (
          <div className="m-empty">
            <span className="m-empty__title">Nothing here</span>
            <p className="m-empty__note">
              {subjectFilter
                ? 'No items for this subject.'
                : hideDone
                  ? 'Everything on the list is done.'
                  : 'Add something from the Week tab.'}
            </p>
          </div>
        )}
      </div>
    </>
  );
}
