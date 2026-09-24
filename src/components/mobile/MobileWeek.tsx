import { useState } from 'react';
import { usePlanner } from '../../store/plannerStore';
import {
  setAnchor,
  setDevicePrefs,
  shiftAnchor,
  useDevicePrefs,
  type MobileDays,
} from '../../store/devicePrefs';
import { missedItems } from '../../lib/missed';
import {
  addDays,
  buildWindow,
  dayName,
  dayOfMonth,
  isWithin,
  monthLong,
  todayISO,
  year,
} from '../../lib/dates';
import { WeekStrip } from './WeekStrip';
import { MobileItemCard, MobileItemRow, MobileRecurringRow, subjectOf } from './MobileRows';
import { MobileRecurringBars } from './MobileRecurringBars';
import { MobileTodoBand } from './MobileTodoBand';
import { SwipeRow } from './SwipeRow';
import { useSwipeX } from './useSwipeX';
import { useStickyHead } from './useStickyHead';
import { useSheets } from './sheets';
import { useRowActions } from './rowActions';
import type { ItemType } from '../../types';

interface Props {
  /** Jumps to the Planner tab, which is where missed items live. */
  onShowMissed: () => void;
}

type BandKey = 'assignments' | 'events' | 'recurring';

const DAY_CHOICES: MobileDays[] = [1, 2, 3];

/** The canvas's chevron, used for both directions. */
function Chevron({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 30 30"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
    >
      <path d="M9.83287 15.0052C9.83702 14.8599 9.86607 14.7271 9.92003 14.6067C9.97398 14.4864 10.057 14.3702 10.1691 14.2581L16.4071 8.21929C16.5856 8.04082 16.8055 7.95159 17.067 7.95159C17.2413 7.95159 17.399 7.99309 17.5401 8.0761C17.6854 8.15911 17.7995 8.27117 17.8826 8.41228C17.9697 8.5534 18.0133 8.71111 18.0133 8.88543C18.0133 9.14275 17.9158 9.36895 17.7207 9.56402L12.0803 14.999L17.7207 20.4401C17.9158 20.6393 18.0133 20.8655 18.0133 21.1187C18.0133 21.2972 17.9697 21.457 17.8826 21.5981C17.7995 21.7392 17.6854 21.8512 17.5401 21.9343C17.399 22.0214 17.2413 22.065 17.067 22.065C16.8055 22.065 16.5856 21.9737 16.4071 21.7911L10.1691 15.7522C10.0528 15.6402 9.96776 15.524 9.9138 15.4036C9.85985 15.2791 9.83287 15.1463 9.83287 15.0052Z" />
    </svg>
  );
}

/**
 * The Week tab, in all three widths.
 *
 * There is no separate Today tab in the phone design: this opens on today at
 * one day, which would be the same screen. The 1/2/3 control is device-local
 * (`devicePrefs`) rather than a planner setting, so choosing one day here
 * cannot collapse the desktop's week once the two are syncing.
 */
export function MobileWeek({ onShowMissed }: Props) {
  const { state, dispatch } = usePlanner();
  const { subjects, items, recurring, todos, notes } = state;
  const { mobileDays, detailsVisible, anchorDate } = useDevicePrefs();
  const { openItem, openCompose } = useSheets();
  const { toggleDone, remove } = useRowActions();
  const [collapsed, setCollapsed] = useState<Record<BandKey, boolean>>({
    assignments: false,
    events: false,
    recurring: false,
  });
  /*
   * Which row has its actions showing. One at a time, and held here rather than
   * in each row, so opening a second closes the first — otherwise a screen of
   * half-open rows is possible and none of them reads as the active one.
   */
  const [swiped, setSwiped] = useState<string | null>(null);

  /* A fling over the bands moves one day; over the strip, one week. */
  const bandsRef = useSwipeX<HTMLDivElement>((direction) => {
    setSwiped(null);
    shiftAnchor(direction);
  });
  const stripRef = useSwipeX<HTMLDivElement>((direction) => {
    setSwiped(null);
    setAnchor(addDays(anchorDate, direction * 7));
  });

  /* Month, days control, strip and day row stay put; the bands scroll under. */
  const headRef = useStickyHead<HTMLDivElement>();

  const today = todayISO();
  const window_ = buildWindow(anchorDate, mobileDays);
  const single = mobileDays === 1;
  const focus = window_[0];
  const missed = missedItems(items, today);

  const itemsFor = (date: string, type: ItemType) =>
    items
      .filter((i) => i.date === date && i.type === type)
      .sort((a, b) => Number(a.done) - Number(b.done) || a.createdAt - b.createdAt);

  const recurringFor = (date: string) =>
    recurring.filter((r) => isWithin(date, r.startDate, r.endDate));

  const countAcross = (type: ItemType) =>
    window_.reduce((n, d) => n + itemsFor(d, type).filter((i) => !i.done).length, 0);

  const recurringCount = new Set(
    window_.flatMap((d) => recurringFor(d).map((r) => r.id)),
  ).size;

  function toggleBand(key: BandKey) {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  }

  const dueCount = countAcross('assignment');
  const eventCount = countAcross('event');
  const nothingToday =
    single &&
    itemsFor(focus, 'assignment').length === 0 &&
    itemsFor(focus, 'event').length === 0 &&
    recurringFor(focus).length === 0;

  function bandHeader(key: BandKey, label: string, count: string) {
    return (
      <button type="button" className="m-band" onClick={() => toggleBand(key)}>
        <span className="m-band__label">{label}</span>
        <span className="m-band__count">{count}</span>
        <span className="m-band__caret" data-collapsed={collapsed[key]} aria-hidden="true">
          ▾
        </span>
      </button>
    );
  }

  /** One band's worth of item rows (1 day) or columns of cards (2–3 days). */
  function itemBand(type: ItemType) {
    if (single) {
      const list = itemsFor(focus, type);
      return (
        <>
          {list.map((item) => {
            const target = { kind: 'item' as const, id: item.id, date: focus };
            return (
              <SwipeRow
                key={item.id}
                enabled
                open={swiped === item.id}
                onOpen={() => setSwiped(item.id)}
                onClose={() => setSwiped(null)}
                doneLabel={item.done ? 'Undo' : 'Done'}
                onDone={() => toggleDone(target)}
                // Move opens the item sheet, where the week strip and the date
                // field already are — a second date picker would be the same
                // surface with less on it.
                onMove={() => openItem(target)}
                onDelete={() => remove(target)}
              >
                <MobileItemRow
                  item={item}
                  subject={subjectOf(subjects, item.subjectId)}
                  showDetails={detailsVisible}
                  onToggle={() => dispatch({ type: 'item/toggle', id: item.id })}
                  onOpen={() => openItem(target)}
                />
              </SwipeRow>
            );
          })}
          <button
            type="button"
            className="m-add"
            onClick={() => openCompose({ mode: 'new', date: focus, band: type })}
          >
            + Add {type}
          </button>
        </>
      );
    }
    return (
      <div className="m-cols" style={{ '--m-cols': mobileDays } as React.CSSProperties}>
        {window_.map((date) => (
          <div key={date} className="m-col">
            {itemsFor(date, type).map((item) => (
              <MobileItemCard
                key={item.id}
                item={item}
                subject={subjectOf(subjects, item.subjectId)}
                showDetails={detailsVisible}
                tight={mobileDays === 3}
                onToggle={() => dispatch({ type: 'item/toggle', id: item.id })}
                onOpen={() => openItem({ kind: 'item', id: item.id, date })}
              />
            ))}
            <button
              type="button"
              className="m-col__add"
              onClick={() => openCompose({ mode: 'new', date, band: type })}
            >
              + Add
            </button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      {/*
        Everything above the first band is one pinned shelf: which day you are
        looking at, and the controls that change it, have to stay reachable
        however far down the day you have scrolled.
      */}
      <div className="m-stickyhead" ref={headRef}>
        <div className="m-head">
          <h1 className="m-head__title">
            {monthLong(focus)} <span className="m-head__year">{year(focus)}</span>
          </h1>
          <div className="m-days" role="group" aria-label="Days shown">
            {DAY_CHOICES.map((n) => (
              <button
                key={n}
                type="button"
                className="m-days__opt"
                data-active={mobileDays === n}
                aria-pressed={mobileDays === n}
                onClick={() => setDevicePrefs({ mobileDays: n })}
              >
                {n}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="m-plus"
            aria-label="New item"
            onClick={() => openCompose({ mode: 'new', date: focus, band: 'assignment' })}
          >
            +
          </button>
        </div>

        {/* The wrapper is what the fling moves; the strip itself is a grid. */}
        <div className="m-swipearea m-swipearea--strip" ref={stripRef}>
          <WeekStrip
            anchorDate={anchorDate}
            days={mobileDays}
            items={items}
            recurring={recurring}
            subjects={subjects}
            onPick={setAnchor}
          />
        </div>

        <div className="m-dayrow">
          {missed.length > 0 && (
            <button type="button" className="m-missed" onClick={onShowMissed}>
              <span className="m-missed__label">Missed</span>
              <span className="m-missed__count">{missed.length}</span>
            </button>
          )}
          <div className="m-dayrow__right">
            <button
              type="button"
              className="m-toggle"
              data-on={detailsVisible}
              aria-pressed={detailsVisible}
              onClick={() => setDevicePrefs({ detailsVisible: !detailsVisible })}
            >
              Details
            </button>
            {/* One day at a time in every mode, matching the desktop's arrows. */}
            <button
              type="button"
              className="m-nav"
              aria-label="Previous day"
              onClick={() => shiftAnchor(-1)}
            >
              <Chevron />
            </button>
            <button
              type="button"
              className="m-nav"
              aria-label="Next day"
              onClick={() => shiftAnchor(1)}
            >
              <Chevron flip />
            </button>
          </div>
        </div>

        {!single && (
          <div className="m-colheads" style={{ '--m-cols': mobileDays } as React.CSSProperties}>
            {window_.map((date) => (
              <button
                key={date}
                type="button"
                className="m-colhead"
                data-today={date === today}
                onClick={() => {
                  // Opening a column is the phone's version of the day page.
                  setDevicePrefs({ mobileDays: 1, anchorDate: date });
                }}
              >
                <span className="m-colhead__name">
                  {mobileDays === 2 ? dayName(date) : dayName(date).slice(0, 3)}
                </span>
                <span className="m-colhead__date" data-today={date === today}>
                  {dayOfMonth(date)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Everything inside here answers to the day-change fling. The to-do band
          and the notes box below are deliberately outside it: the to-dos are not
          a day's, and a drag across the notes belongs to the text in them. */}
      <div className="m-swipearea" ref={bandsRef}>
        {nothingToday ? (
          <div className="m-empty">
            <span className="m-empty__title">Nothing on {dayName(focus)}</span>
            <p className="m-empty__note">No assignments, events or recurring items.</p>
            <div className="m-empty__actions">
              <button
                type="button"
                className="m-empty__btn"
                onClick={() => openCompose({ mode: 'new', date: focus, band: 'assignment' })}
              >
                + Assignment
              </button>
              <button
                type="button"
                className="m-empty__btn"
                onClick={() => openCompose({ mode: 'new', date: focus, band: 'event' })}
              >
                + Event
              </button>
            </div>
          </div>
        ) : (
          <>
            {bandHeader('assignments', 'Assignments', `${dueCount} due`)}
            {!collapsed.assignments && itemBand('assignment')}

            {bandHeader('events', 'Events', single ? `${eventCount} today` : `${eventCount}`)}
            {!collapsed.events && itemBand('event')}

            {bandHeader('recurring', 'Recurring', `${recurringCount} active`)}
            {!collapsed.recurring &&
              (single ? (
                <>
                  {recurringFor(focus).map((r) => {
                    const target = { kind: 'recurring' as const, id: r.id, date: focus };
                    return (
                      <SwipeRow
                        key={r.id}
                        enabled
                        open={swiped === r.id}
                        onOpen={() => setSwiped(r.id)}
                        onClose={() => setSwiped(null)}
                        doneLabel={r.doneDates.includes(focus) ? 'Undo' : 'Done'}
                        onDone={() => toggleDone(target)}
                        onMove={() => openItem(target)}
                        onDelete={() => remove(target)}
                      >
                        <MobileRecurringRow
                          item={r}
                          subject={subjectOf(subjects, r.subjectId)}
                          date={focus}
                          onToggleDay={() =>
                            dispatch({ type: 'recurring/toggleDay', id: r.id, date: focus })
                          }
                          onOpen={() => openItem(target)}
                        />
                      </SwipeRow>
                    );
                  })}
                  {recurringFor(focus).length === 0 && (
                    <div className="m-bars m-bars--empty">Nothing recurring today</div>
                  )}
                  <button
                    type="button"
                    className="m-add"
                    onClick={() => openCompose({ mode: 'new', date: focus, band: 'recurring' })}
                  >
                    + Add recurring
                  </button>
                </>
              ) : (
                <MobileRecurringBars
                  window={window_}
                  recurring={recurring}
                  subjects={subjects}
                  // A bar can cover days that are off screen, so the tick it
                  // offers is for the leftmost day it actually reaches here.
                  onOpen={(id) => {
                    const r = recurring.find((x) => x.id === id);
                    const day = window_.find((d) => r && isWithin(d, r.startDate, r.endDate));
                    openItem({ kind: 'recurring', id, date: day ?? focus });
                  }}
                />
              ))}
          </>
        )}
      </div>

      <MobileTodoBand
        todos={todos}
        onAdd={(text) => dispatch({ type: 'todo/add', text })}
        onToggle={(id) => dispatch({ type: 'todo/toggle', id })}
        onClearDone={() => dispatch({ type: 'todo/clearDone' })}
      />

      {/* Notes belong to a single day, so they only appear when one is shown. */}
      {single && (
        <div className="m-notes">
          <span className="m-notes__label">Notes</span>
          <textarea
            className="m-notes__field"
            placeholder="Free text for the day."
            value={notes[focus]?.text ?? ''}
            onChange={(e) => dispatch({ type: 'note/set', date: focus, text: e.target.value })}
          />
        </div>
      )}
    </>
  );
}
