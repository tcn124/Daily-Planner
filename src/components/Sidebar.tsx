import { usePlanner } from '../store/plannerStore';
import { subjectAccent } from '../lib/color';
import { addDays, dayName, dayOfMonth, isWithin, startOfWeek, todayISO } from '../lib/dates';
import { missedItems } from '../lib/missed';
import { compactTime, lateShort, pad2 } from '../lib/format';
import { recurringProgress } from '../lib/recurring';
import { focusToday, setAnchor, setView, useDevicePrefs } from '../store/devicePrefs';
import { DEFAULT_HUE } from '../store/defaults';
import type { Item, RecurringItem, Subject } from '../types';

interface Props {
  collapsed: boolean;
  onExpand: () => void;
  onOpenSettings: () => void;
  /** Opens the day page for a date — where an Upcoming row leads. */
  onOpenDay: (date: string) => void;
  /** Opens the full Missed page — the sidebar only has room for three. */
  onOpenMissed: () => void;
}

const MISSED_SHOWN = 3;

/**
 * One line of the sidebar: subject (serif) · title, with a right-hand note.
 * The checkbox and ✕ appear on hover, like a card's — the resting row is just
 * text, as drawn.
 */
function SideRow({
  subject,
  title,
  meta,
  done,
  late,
  onOpen,
  onToggle,
  onDelete,
}: {
  subject: string;
  title: string;
  meta: string;
  done: boolean;
  late?: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="srow" data-done={done}>
      <button type="button" className="srow__main" onClick={onOpen} title={`${subject} · ${title}`}>
        <span className="srow__subject">{subject}</span>
        <span className="srow__sep" aria-hidden="true">·</span>
        <span className="srow__title">{title}</span>
      </button>
      <span className="srow__meta" data-late={late || undefined}>{meta}</span>
      <span className="srow__actions">
        {onDelete && (
          <button type="button" className="kill" aria-label={`Delete ${title}`} onClick={onDelete} />
        )}
        <button
          type="button"
          className="checkbox"
          data-checked={done}
          aria-pressed={done}
          aria-label={done ? `Mark ${title} as not done` : `Mark ${title} as done`}
          onClick={onToggle}
        />
      </span>
    </div>
  );
}

export function Sidebar({ collapsed, onExpand, onOpenSettings, onOpenDay, onOpenMissed }: Props) {
  const { state, dispatch } = usePlanner();
  const { subjects, items, recurring } = state;
  const { daysVisible } = useDevicePrefs();
  const today = todayISO();
  const tomorrow = addDays(today, 1);

  const missed = missedItems(items, today);
  const todayCount = items.filter((i) => i.date === today).length;

  const subjectOf = (id: string | null): Subject | undefined => subjects.find((s) => s.id === id);
  const subjectName = (id: string | null) => subjectOf(id)?.name ?? 'No subject';

  const countFor = (id: string) =>
    items.filter((i) => i.subjectId === id).length +
    recurring.filter((r) => r.subjectId === id).length;

  /** Jump the visible window to the week containing a missed item. */
  function revealMissed(date: string) {
    // A whole-week window lands on the Monday; any other count lands on the
    // day itself, so the item is the leftmost column rather than off-screen.
    setAnchor(daysVisible % 7 === 0 ? startOfWeek(date) : date);
    setView('grid');
  }

  function rescheduleAll() {
    for (const item of missed) {
      dispatch({ type: 'item/update', id: item.id, patch: { date: today } });
    }
    focusToday();
  }

  function addSubject() {
    dispatch({
      type: 'subject/add',
      name: 'New subject',
      // Spread new subjects around the wheel so they stay distinct.
      hue: (DEFAULT_HUE + subjects.length * 47) % 360,
    });
    onOpenSettings();
  }

  if (collapsed) {
    return (
      <aside className="sidebar sidebar--collapsed">
        <button type="button" className="sidebar__expand" title="Expand sidebar"
          aria-label="Expand sidebar" onClick={onExpand}>
          »
        </button>
        <button type="button" className="sidebar__stat sidebar__stat--first"
          title="Show today" onClick={focusToday}>
          <span className="sidebar__stat-n">{todayCount}</span>
          <span className="sidebar__stat-label" data-tone="accent">Today</span>
        </button>
        {missed.length > 0 && (
          <button type="button" className="sidebar__stat" title="Show everything missed"
            onClick={onOpenMissed}>
            <span className="sidebar__stat-n">{missed.length}</span>
            <span className="sidebar__stat-label" data-tone="danger">Missed</span>
          </button>
        )}
        <button type="button" className="sidebar__edit link link--muted" onClick={onOpenSettings}>
          Edit
        </button>
      </aside>
    );
  }

  /** Everything on a day: its items, then the spans running through it. */
  function upcoming(date: string): { items: Item[]; spans: RecurringItem[] } {
    return {
      items: items.filter((i) => i.date === date),
      spans: recurring.filter((r) => isWithin(date, r.startDate, r.endDate)),
    };
  }

  function upcomingDay(label: string, date: string) {
    const day = upcoming(date);
    return (
      <div key={date} className="sidebar__dayblock">
        <div className="sidebar__day">
          <span className="sidebar__day-label">{label}</span>
          <span className="sidebar__day-date">
            {dayName(date).slice(0, 3)} {dayOfMonth(date)}
          </span>
        </div>
        {day.items.length + day.spans.length === 0 && (
          <p className="sidebar__empty">Nothing due</p>
        )}
        {day.items.map((item) => (
          <SideRow
            key={item.id}
            subject={subjectName(item.subjectId)}
            title={item.description || 'Untitled'}
            meta={compactTime(item.time)}
            done={item.done}
            onOpen={() => onOpenDay(date)}
            onToggle={() => dispatch({ type: 'item/toggle', id: item.id })}
          />
        ))}
        {day.spans.map((r) => {
          const p = recurringProgress(r, date);
          return (
            <SideRow
              key={r.id}
              subject={subjectName(r.subjectId)}
              title={r.title || 'Untitled'}
              meta={`Day ${p.dayIndex}/${p.total}`}
              done={r.doneDates.includes(date)}
              onOpen={() => onOpenDay(date)}
              onToggle={() => dispatch({ type: 'recurring/toggleDay', id: r.id, date })}
            />
          );
        })}
      </div>
    );
  }

  return (
    <aside className="sidebar">
      <section className="sidebar__section">
        <h2 className="sidebar__head"><span className="sidebar__head-word" data-tone="accent">Upcoming</span></h2>
        <div className="sidebar__rows">
          {upcomingDay('Today', today)}
          {upcomingDay('Tomorrow', tomorrow)}
        </div>
      </section>

      {missed.length > 0 && (
        <section className="sidebar__section">
          <h2 className="sidebar__head">
            <button type="button" className="sidebar__head-link" onClick={onOpenMissed}
              title="Show everything missed">
              <span className="sidebar__head-word" data-tone="danger">Missed</span>
              <span className="count">{pad2(missed.length)}</span>
            </button>
          </h2>
          <div className="sidebar__rows">
            {missed.slice(0, MISSED_SHOWN).map((item) => (
              <SideRow
                key={item.id}
                subject={subjectName(item.subjectId)}
                title={item.description || 'Untitled'}
                meta={lateShort(item.date, today)}
                done={false}
                onOpen={() => revealMissed(item.date)}
                onToggle={() => dispatch({ type: 'item/toggle', id: item.id })}
                onDelete={() => dispatch({ type: 'item/delete', id: item.id })}
              />
            ))}
          </div>
          <div className="sidebar__links">
            <button type="button" className="link sidebar__more" onClick={onOpenMissed}>
              {missed.length > MISSED_SHOWN ? `See all ${missed.length}` : 'Open'}
            </button>
            <button type="button" className="link sidebar__more" onClick={rescheduleAll}>
              Reschedule all →
            </button>
          </div>
        </section>
      )}

      <section className="sidebar__section">
        <h2 className="sidebar__head">Subjects</h2>
        <div className="sidebar__subjects">
          {subjects.map((s) => (
            <button key={s.id} type="button" className="sidebar__subject link"
              onClick={onOpenSettings}
              title={`Edit ${s.name} · ${countFor(s.id)} item${countFor(s.id) === 1 ? '' : 's'}`}>
              <span className="dot" style={{ background: subjectAccent(s.hue) }} />
              {s.name}
            </button>
          ))}
          <button type="button" className="sidebar__subject link link--muted" onClick={addSubject}>
            + New
          </button>
        </div>
      </section>

      <div className="sidebar__footer">
        <button type="button" className="link link--muted sidebar__footer-link"
          onClick={onOpenSettings}>
          Edit planner
        </button>
      </div>
    </aside>
  );
}
