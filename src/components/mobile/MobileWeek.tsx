import { useState, type CSSProperties } from 'react';
import { usePlanner } from '../../store/plannerStore';
import {
  goToToday,
  setAnchor,
  setDevicePrefs,
  shiftAnchor,
  useDevicePrefs,
  type MobileDays,
} from '../../store/devicePrefs';
import {
  addDays,
  buildWindow,
  dayName,
  dayOfMonth,
  isWithin,
  isoWeek,
  monthLong,
  startOfWeek,
  todayISO,
} from '../../lib/dates';
import { WeekStrip } from './WeekStrip';
import { MobileItemCard, MobileItemRow, MobileRecurringRow, subjectOf } from './MobileRows';
import { MobileRecurringBars } from './MobileRecurringBars';
import { MissedRow } from './MissedRow';
import { SwipeRow } from './SwipeRow';
import { useSwipeX } from './useSwipeX';
import { useStickyHead } from './useStickyHead';
import { useSheets, type ItemTarget } from './sheets';
import { useRowActions } from './rowActions';

const DAY_CHOICES: MobileDays[] = [1, 2, 3];

/**
 * The Week tab, in all three widths (frames 4a–4c).
 *
 * There is no separate Today tab in the phone design: this opens on today at
 * one day, which would be the same screen, and tapping the month comes back
 * to it. There are no arrows either — a swipe over the strip moves a week, a
 * swipe over the page moves a day. The 1 · 2 · 3 switch is device-local
 * (`devicePrefs`) rather than a planner setting, so choosing one day here
 * cannot collapse the desktop's week once the two are syncing.
 *
 * Events are drawn in with assignments under "Due": the redesign has one kind
 * of dated item, and the stored type is left alone.
 */
export function MobileWeek() {
  const { state, dispatch } = usePlanner();
  const { subjects, items, recurring, notes } = state;
  const { mobileDays, detailsVisible, anchorDate } = useDevicePrefs();
  const { openItem, openCompose } = useSheets();
  const { toggleDone, remove } = useRowActions();
  /*
   * Which row has its actions showing. One at a time, and held here rather than
   * in each row, so opening a second closes the first — otherwise a screen of
   * half-open rows is possible and none of them reads as the active one.
   */
  const [swiped, setSwiped] = useState<string | null>(null);

  /* A fling over the page moves one day; over the strip, one week. */
  const bandsRef = useSwipeX<HTMLDivElement>((direction) => {
    setSwiped(null);
    shiftAnchor(direction);
  });
  const stripRef = useSwipeX<HTMLDivElement>((direction) => {
    setSwiped(null);
    setAnchor(addDays(anchorDate, direction * 7));
  });

  /* Month, days switch, strip and missed row stay put; the day scrolls under. */
  const headRef = useStickyHead<HTMLDivElement>();

  const today = todayISO();
  const window_ = buildWindow(anchorDate, mobileDays);
  const single = mobileDays === 1;
  const focus = window_[0];
  const cols = { '--m-cols': mobileDays } as CSSProperties;

  const itemsFor = (date: string) =>
    items
      .filter((i) => i.date === date)
      .sort((a, b) => Number(a.done) - Number(b.done) || a.createdAt - b.createdAt);

  const recurringFor = (date: string) =>
    recurring.filter((r) => isWithin(date, r.startDate, r.endDate));

  const recurringCount = new Set(window_.flatMap((d) => recurringFor(d).map((r) => r.id))).size;

  /* "A clear week." — the whole week on the strip has nothing in it at all. */
  const week = buildWindow(startOfWeek(anchorDate), 7);
  const clearWeek =
    !items.some((i) => week.includes(i.date)) &&
    !recurring.some((r) => r.startDate <= week[6] && r.endDate >= week[0]);

  function swipeRow(key: string, target: ItemTarget, done: boolean, child: React.ReactNode) {
    return (
      <SwipeRow
        key={key}
        enabled
        open={swiped === key}
        onOpen={() => setSwiped(key)}
        onClose={() => setSwiped(null)}
        doneLabel={done ? 'Undo' : 'Done'}
        onDone={() => toggleDone(target)}
        // Move opens the item sheet, where the week strip already is — a second
        // date picker would be the same surface with less on it.
        onMove={() => openItem(target)}
        onDelete={() => remove(target)}
      >
        {child}
      </SwipeRow>
    );
  }

  /* ---- one day ------------------------------------------------------- */

  function oneDay() {
    const due = itemsFor(focus);
    const spans = recurringFor(focus);
    return (
      <>
        <div className="m-dayhead m-dayhead--big" data-today={focus === today}>
          <span className="m-dayhead__name">{dayName(focus)}</span>
          <span className="m-dayhead__num">{dayOfMonth(focus)}.</span>
          {focus === today && <span className="m-dayhead__note">Today</span>}
        </div>

        <section>
          <div className="m-sec">
            <span className="m-sec__title">Due</span>
            <span className="m-sec__count">{due.filter((i) => !i.done).length}</span>
          </div>
          <div className="m-rows">
            {due.length === 0 && (
              <div className="m-nothing">
                <span>Nothing due</span>
                <button type="button" className="m-textbtn"
                  onClick={() => openCompose({ mode: 'new', date: focus, band: 'assignment' })}>
                  + Add
                </button>
              </div>
            )}
            {due.map((item) =>
              swipeRow(
                item.id,
                { kind: 'item', id: item.id, date: focus },
                item.done,
                <MobileItemRow
                  item={item}
                  subject={subjectOf(subjects, item.subjectId)}
                  showDetails={detailsVisible}
                  onOpen={() => openItem({ kind: 'item', id: item.id, date: focus })}
                />,
              ),
            )}
            {due.length > 0 && (
              <button type="button" className="m-action m-action--muted"
                onClick={() => openCompose({ mode: 'new', date: focus, band: 'assignment' })}>
                + Add assignment
              </button>
            )}
          </div>
        </section>

        <section>
          <div className="m-sec">
            <span className="m-sec__title">Recurring</span>
            <span className="m-sec__count">{spans.length}</span>
          </div>
          <div className="m-rows">
            {spans.map((r) =>
              swipeRow(
                r.id,
                { kind: 'recurring', id: r.id, date: focus },
                r.doneDates.includes(focus),
                <MobileRecurringRow
                  item={r}
                  subject={subjectOf(subjects, r.subjectId)}
                  date={focus}
                  meta="day"
                  onOpen={() => openItem({ kind: 'recurring', id: r.id, date: focus })}
                />,
              ),
            )}
            <button type="button" className="m-action m-action--muted"
              onClick={() => openCompose({ mode: 'new', date: focus, band: 'recurring' })}>
              + Add recurring
            </button>
          </div>
        </section>
      </>
    );
  }

  /* ---- two and three days -------------------------------------------- */

  function columns() {
    return (
      <>
        <div className="m-cols" style={cols}>
          {window_.map((date) => {
            const list = itemsFor(date);
            return (
              <div key={date} className="m-col">
                {list.length === 0 && <span className="m-col__empty">Nothing due</span>}
                {list.map((item) => (
                  <MobileItemCard
                    key={item.id}
                    item={item}
                    subject={subjectOf(subjects, item.subjectId)}
                    showDetails={false}
                    tight={mobileDays === 3}
                    onOpen={() => openItem({ kind: 'item', id: item.id, date })}
                  />
                ))}
                <button type="button" className="m-col__add"
                  onClick={() => openCompose({ mode: 'new', date, band: 'assignment' })}>
                  + Add
                </button>
              </div>
            );
          })}
        </div>

        <section className="m-cols__recurring">
          <div className="m-sec">
            <span className="m-sec__title">Recurring</span>
            <span className="m-sec__count">{recurringCount}</span>
          </div>
          <MobileRecurringBars
            window={window_}
            recurring={recurring}
            subjects={subjects}
            // A bar can cover days that are off screen, so the tick it offers
            // is for the leftmost day it actually reaches here.
            onOpen={(id) => {
              const r = recurring.find((x) => x.id === id);
              const day = window_.find((d) => r && isWithin(d, r.startDate, r.endDate));
              openItem({ kind: 'recurring', id, date: day ?? focus });
            }}
          />
        </section>
      </>
    );
  }

  return (
    <>
      {/*
        Everything above the day is one pinned shelf: which day you are looking
        at, and the controls that change it, have to stay reachable however far
        down the day you have scrolled.
      */}
      <div className="m-stickyhead" ref={headRef}>
        <div className="m-weekhead">
          <div className="m-head m-head--week">
            <button type="button" className="m-head__lead m-head__today" onClick={goToToday}
              aria-label={`${monthLong(focus)}, week ${isoWeek(focus)}. Go to today`}>
              <h1 className="m-head__title">{monthLong(focus)}.</h1>
              <span className="m-head__sub">Week {isoWeek(focus)}</span>
            </button>
            <div className="m-days" role="group" aria-label="Days shown">
              {DAY_CHOICES.map((n) => (
                <button
                  key={n}
                  type="button"
                  className="m-days__opt"
                  data-active={mobileDays === n}
                  aria-pressed={mobileDays === n}
                  aria-label={`${n} day${n === 1 ? '' : 's'}`}
                  onClick={() => setDevicePrefs({ mobileDays: n })}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* The wrapper is what the fling moves; the strip itself is a grid. */}
          <div className="m-swipearea m-swipearea--strip" ref={stripRef}>
            <WeekStrip anchorDate={anchorDate} days={mobileDays} onPick={setAnchor} />
          </div>
        </div>

        <MissedRow />

        {!single && !clearWeek && (
          <div className="m-colheads" style={cols}>
            {window_.map((date) => (
              <button
                key={date}
                type="button"
                className="m-colhead"
                data-today={date === today}
                // Opening a column is the phone's version of the day page.
                onClick={() => setDevicePrefs({ mobileDays: 1, anchorDate: date })}
              >
                <span className="m-colhead__name">
                  {mobileDays === 2 ? dayName(date) : dayName(date).slice(0, 3)}
                  {mobileDays === 2 && date === today ? ' · Today' : ''}
                </span>
                <span className="m-colhead__num">{dayOfMonth(date)}.</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Everything inside here answers to the day-change fling. The notes box
          below is deliberately outside it: a drag across the notes belongs to
          the text in them. */}
      <div className="m-swipearea" ref={bandsRef}>
        {clearWeek ? (
          <div className="m-clear">
            <span className="m-clear__title">A clear week.</span>
            <p className="m-clear__note">
              Nothing planned yet. Add an assignment, or import a syllabus from the desktop app.
            </p>
            <button type="button" className="m-pillbtn"
              onClick={() => openCompose({ mode: 'new', date: focus, band: 'assignment' })}>
              New item
            </button>
          </div>
        ) : single ? (
          oneDay()
        ) : (
          columns()
        )}
      </div>

      {/* Notes belong to a single day, so they only appear when one is shown. */}
      {single && (
        <section className="m-notes">
          <div className="m-sec">
            <label className="m-sec__title" htmlFor="m-day-notes">Notes</label>
          </div>
          <textarea
            id="m-day-notes"
            className="m-input m-notes__field"
            placeholder="Free text for the day."
            value={notes[focus]?.text ?? ''}
            onChange={(e) => dispatch({ type: 'note/set', date: focus, text: e.target.value })}
          />
        </section>
      )}
    </>
  );
}
