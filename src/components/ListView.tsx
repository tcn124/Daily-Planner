import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePlanner } from '../store/plannerStore';
import { dayName, dayOfMonth, formatSpan, todayISO } from '../lib/dates';
import { activeDates, rowsForDate, type ListRow } from '../lib/listRows';
import { subjectAccent } from '../lib/color';
import { uid } from '../store/defaults';
import { startItemDrag, useDropTarget } from '../lib/dnd';
import { compactTime, pad2 } from '../lib/format';
import { recurringProgress } from '../lib/recurring';
import { MAX_ZOOM, MIN_ZOOM, stepListZoom, useDevicePrefs } from '../store/devicePrefs';
import { TodoStrip } from './TodoStrip';
import { ItemComposer, type ComposerValue } from './ItemComposer';
import { SubjectSquare } from './SubjectSquare';
import { Menu, MenuItem, MenuLabel } from './Menu';
import { Plus } from './icons';

type Kind = 'assignment' | 'event' | 'recurring';
type GroupBy = 'day' | 'subject';
type SortBy = 'default' | 'time' | 'subject';

type Row = ListRow;

/* Events are folded in with assignments in the redesign; the stored type stays. */
const TYPE_LABEL: Record<Kind, string> = {
  assignment: 'Assignment',
  event: 'Assignment',
  recurring: 'Recurring',
};

interface DropSectionProps {
  date: string | null;
  draggingId: string | null;
  onDropItem: (id: string) => void;
  children: ReactNode;
}

/** A list group that accepts a dragged item. Owns the drop-target hook per group. */
function DropSection({ date, draggingId, onDropItem, children }: DropSectionProps) {
  const { over, handlers } = useDropTarget(draggingId, onDropItem);
  return (
    <section
      className={over ? 'list__section list__section--drop' : 'list__section'}
      data-date={date ?? undefined}
      {...handlers}
    >
      {children}
    </section>
  );
}

const GROUP_LABEL: Record<GroupBy, string> = { day: 'Day', subject: 'Subject' };
const SORT_LABEL: Record<SortBy, string> = {
  default: 'Default',
  time: 'Time',
  subject: 'Subject',
};

interface Props {
  /** The top bar's content slot; the list's title and controls render into it. */
  slot: HTMLElement | null;
}

export function ListView({ slot }: Props) {
  const { state, dispatch } = usePlanner();
  const { subjects, items, recurring, todos } = state;
  const [groupBy, setGroupBy] = useState<GroupBy>('day');
  const [sortBy, setSortBy] = useState<SortBy>('default');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [composingDate, setComposingDate] = useState<string | null>(null);
  /** Subjects shown; empty means all. Ephemeral, like the grouping. */
  const [shown, setShown] = useState<Set<string>>(new Set());
  const { listZoom } = useDevicePrefs();

  const today = todayISO();

  /*
   * The list has no window: it shows every day that has anything on it, from
   * the earliest to the latest, so nothing is ever out of reach. Days with
   * nothing scheduled are simply absent rather than padded in — except today,
   * which is always there so the list always has its bearings (and an empty
   * today says so), and a day a new item is being composed on, which needs
   * somewhere to appear.
   */
  const dates = [
    ...new Set([
      ...activeDates(items, recurring),
      today,
      ...(composingDate ? [composingDate] : []),
    ]),
  ].sort();

  function sortRows(rows: Row[]): Row[] {
    return rows.slice().sort((a, b) => {
      if (sortBy === 'time') {
        // Untimed rows sink below timed ones rather than sorting as empty.
        if (!a.time !== !b.time) return a.time ? -1 : 1;
        return a.time.localeCompare(b.time) || a.createdAt - b.createdAt;
      }
      if (sortBy === 'subject') {
        return a.subject.localeCompare(b.subject) || a.createdAt - b.createdAt;
      }
      // Default: assignments before events before recurring, then creation order.
      if (a.kind !== b.kind) {
        const order = { assignment: 0, event: 1, recurring: 2 };
        return order[a.kind] - order[b.kind];
      }
      return a.createdAt - b.createdAt;
    });
  }

  const passes = (row: Row) => shown.size === 0 || (row.subjectId !== null && shown.has(row.subjectId));

  function rowsFor(date: string): Row[] {
    return sortRows(rowsForDate(date, items, recurring, subjects).filter(passes));
  }

  const allRows = dates.flatMap(rowsFor);

  /** One section per day, or one per subject across everything. */
  const sections =
    groupBy === 'day'
      ? dates.map((date) => ({
          key: date,
          date: date as string | null,
          title: dayName(date).slice(0, 3),
          badge: `${dayOfMonth(date)}.`,
          hue: null as number | null,
          isToday: date === today,
          isPast: date < today,
          rows: rowsFor(date),
        }))
          // A filtered-out day disappears, unless it's the one being composed on.
          .filter((s) => s.rows.length > 0 || s.isToday || s.date === composingDate)
      : [...subjects, null]
          .map((s) => ({
            key: s?.id ?? 'none',
            date: null as string | null,
            title: s?.name ?? 'No subject',
            badge: '',
            hue: s?.hue ?? null,
            isToday: false,
            isPast: false,
            rows: allRows.filter((r) => r.subjectId === (s?.id ?? null)),
          }))
          .filter((s) => s.rows.length > 0);

  const bodyRef = useRef<HTMLDivElement>(null);

  /** Brings the first day on or after `from` to the top of the list. */
  function scrollToDate(from: string) {
    const target = dates.find((d) => d >= from);
    if (!target) return;
    const el = bodyRef.current?.querySelector<HTMLElement>(`[data-date="${target}"]`);
    el?.scrollIntoView({ block: 'start' });
  }

  useEffect(() => {
    if (groupBy !== 'day') return;
    scrollToDate(today);
    // Only on first open: later re-renders must not yank the scroll position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Header "New item": compose on today, grouped by day so today has a home. */
  function newItemToday() {
    setGroupBy('day');
    setEditingId(null);
    setComposingDate(today);
    // After the render that adds today's section.
    requestAnimationFrame(() => scrollToDate(today));
  }

  function toggleShown(id: string) {
    setShown((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      // Every subject ticked is the same as no filter.
      return next.size === subjects.length ? new Set() : next;
    });
  }

  const showLabel =
    shown.size === 0
      ? 'All subjects'
      : shown.size === 1
        ? subjects.find((s) => shown.has(s.id))?.name ?? '1 subject'
        : `${shown.size} subjects`;

  /** The Due column: the time, the day of a span, or "Missed". */
  function dueFor(row: Row): { text: string; late: boolean } {
    if (row.kind === 'recurring') {
      const span = recurring.find((r) => r.id === row.id);
      const p = span ? recurringProgress(span, row.date) : null;
      return { text: p ? `${p.dayIndex}/${p.total}` : '', late: false };
    }
    if (!row.done && row.date < today) return { text: 'Missed', late: true };
    return { text: compactTime(row.time), late: false };
  }

  function toggle(row: Row) {
    dispatch(
      row.kind === 'recurring'
        ? { type: 'recurring/toggleDay', id: row.id, date: row.date }
        : { type: 'item/toggle', id: row.id },
    );
  }

  function remove(row: Row) {
    dispatch(
      row.kind === 'recurring'
        ? { type: 'recurring/delete', id: row.id }
        : { type: 'item/delete', id: row.id },
    );
  }

  function createSubject(name: string, hue: number | null): string {
    const id = uid();
    dispatch({ type: 'subject/add', name, hue, id });
    return id;
  }

  const [draggingId, setDraggingId] = useState<string | null>(null);

  /**
   * Dropping into a group moves the item to whatever that group represents:
   * a day when grouped by day, a subject when grouped by subject. Cleanup runs
   * here rather than only in dragend — a successful drop re-homes the row into
   * another section, React unmounts the original element, and the browser's
   * dragend then fires on a detached node that React never hears.
   */
  function onDropItem(id: string, section: (typeof sections)[number]) {
    setDraggingId(null);
    const item = items.find((i) => i.id === id);
    if (!item) return;
    if (section.date !== null) {
      if (item.date !== section.date) {
        dispatch({ type: 'item/update', id, patch: { date: section.date } });
      }
    } else {
      const subjectId = section.key === 'none' ? null : section.key;
      if (item.subjectId !== subjectId) {
        dispatch({ type: 'item/update', id, patch: { subjectId } });
      }
    }
  }

  function submit(value: ComposerValue, row: Row | null, date: string) {
    if (row) {
      if (row.kind === 'recurring') {
        // Recurring spans keep their dates; only title and subject are editable here.
        dispatch({
          type: 'recurring/update',
          id: row.id,
          patch: { subjectId: value.subjectId, title: value.description },
        });
      } else {
        dispatch({ type: 'item/update', id: row.id, patch: value });
      }
    } else {
      dispatch({ type: 'item/add', item: { date, done: false, ...value } });
    }
    setEditingId(null);
    setComposingDate(null);
  }

  return (
    <div className="list">
      {slot && createPortal(
      <div className="viewbar">
        <div className="viewbar__lead">
          <h1 className="viewbar__title">List.</h1>
          <div className="viewbar__eyebrow">
            <span className="viewbar__eyebrow-soft">
              {dates.length ? formatSpan([dates[0], dates[dates.length - 1]]) : 'Nothing yet'}
            </span>
            <span>
              {allRows.length} item{allRows.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <div className="viewbar__actions">
          <button type="button" className="link" onClick={() => {
            setGroupBy('day');
            requestAnimationFrame(() => scrollToDate(today));
          }}>
            Jump to today
          </button>

          <div className="stepper" role="group" aria-label="Zoom">
            <span className="viewbar__muted">Zoom</span>
            <button type="button" className="stepper__btn" aria-label="Zoom out"
              disabled={listZoom <= MIN_ZOOM} onClick={() => stepListZoom(-1)}>
              −
            </button>
            <span className="stepper__value">{Math.round(listZoom * 100)}%</span>
            <button type="button" className="stepper__btn" aria-label="Zoom in"
              disabled={listZoom >= MAX_ZOOM} onClick={() => stepListZoom(1)}>
              +
            </button>
          </div>

          <Menu prefix="Show" label={showLabel}>
            {() => (
              <>
                <MenuItem checked={shown.size === 0} onSelect={() => setShown(new Set())}>
                  All subjects
                </MenuItem>
                {subjects.map((s) => (
                  <MenuItem key={s.id} checked={shown.has(s.id)} onSelect={() => toggleShown(s.id)}>
                    <span className="dot" style={{ background: subjectAccent(s.hue) }} />
                    {s.name}
                  </MenuItem>
                ))}
              </>
            )}
          </Menu>

          <Menu prefix="View" label={GROUP_LABEL[groupBy]}>
            {(close) => (
              <>
                <MenuLabel>Group by</MenuLabel>
                {(Object.keys(GROUP_LABEL) as GroupBy[]).map((g) => (
                  <MenuItem key={g} checked={groupBy === g} onSelect={() => { setGroupBy(g); close(); }}>
                    {GROUP_LABEL[g]}
                  </MenuItem>
                ))}
                <MenuLabel>Sort</MenuLabel>
                {(Object.keys(SORT_LABEL) as SortBy[]).map((k) => (
                  <MenuItem key={k} checked={sortBy === k} onSelect={() => { setSortBy(k); close(); }}>
                    {SORT_LABEL[k]}
                  </MenuItem>
                ))}
              </>
            )}
          </Menu>

          <button type="button" className="link viewbar__new" onClick={newItemToday}>
            New item <Plus />
          </button>
        </div>
      </div>,
        slot,
      )}

      <div className="list__zoom" style={{ zoom: listZoom }}>
      <div className="list__colheads" aria-hidden="true">
        <span>{groupBy === 'day' ? 'Day' : 'Subject'}</span>
        <span>{groupBy === 'day' ? 'Subject' : 'Day'}</span>
        <span>Item</span>
        <span>Type</span>
        <span className="list__colhead-due">Due</span>
      </div>

      <div className="list__body" ref={bodyRef}>
        {sections.map((section) => (
          <DropSection
            key={section.key}
            date={section.date}
            draggingId={draggingId}
            onDropItem={(id) => onDropItem(id, section)}
          >
            <div
              className="list__group"
              data-today={section.isToday || undefined}
              data-past={section.isPast || undefined}
            >
              {section.date ? (
                <>
                  <span className="list__group-name">{section.title}</span>
                  <span className="list__group-date">{section.badge}</span>
                </>
              ) : (
                <span className="list__group-subject">
                  <SubjectSquare hue={section.hue} />
                  {section.title}
                </span>
              )}
              {section.isToday ? (
                <span className="list__group-today">Today</span>
              ) : (
                <span className="count">{pad2(section.rows.length)}</span>
              )}
            </div>

            <div className="list__rows">
            {section.isToday && section.rows.length === 0 && composingDate !== today && (
              <p className="list__nothing">
                {shown.size ? 'Nothing due today for these subjects.' : 'Nothing due today.'}
              </p>
            )}
            {section.rows.map((row) =>
              editingId === row.id ? (
                <div className="list__composer" key={row.id}>
                  <ItemComposer
                    subjects={subjects}
                    date={row.date}
                    title="Edit item"
                    submitLabel="Save"
                    initial={{
                      subjectId: row.subjectId,
                      description: row.desc,
                      details: row.details,
                      time: row.time,
                      type: row.kind === 'event' ? 'event' : 'assignment',
                    }}
                    onSubmit={(v) => submit(v, row, row.date)}
                    onCancel={() => setEditingId(null)}
                    onCreateSubject={createSubject}
                  />
                </div>
              ) : (
                <div
                  className={[
                    'list__row',
                    row.done ? 'list__row--done' : '',
                    draggingId === row.id ? 'list__row--dragging' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  key={`${section.key}-${row.id}`}
                  role="button"
                  tabIndex={0}
                  draggable={row.kind !== 'recurring'}
                  onDragStart={(e) => {
                    startItemDrag(e, row.id);
                    setDraggingId(row.id);
                  }}
                  onDragEnd={() => setDraggingId(null)}
                  onClick={() => {
                    setComposingDate(null);
                    setEditingId(row.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setEditingId(row.id);
                    }
                  }}
                >
                  <span className="list__subject">
                    <SubjectSquare hue={row.hue} dim={row.done} />
                    <span className="list__subject-name">
                      {groupBy === 'day'
                        ? row.subject
                        : `${dayName(row.date).slice(0, 3)} ${dayOfMonth(row.date)}`}
                    </span>
                  </span>
                  <span className="list__desc">
                    <span className="list__title">{row.desc}</span>
                    {row.details && (
                      <span className="list__details" title={row.details}>{row.details}</span>
                    )}
                  </span>
                  <span className="list__type">{TYPE_LABEL[row.kind]}</span>
                  <span className="list__due" data-late={dueFor(row).late || undefined}>
                    {dueFor(row).text}
                  </span>
                  <span className="list__row-actions">
                    <button
                      type="button"
                      className="kill list__kill"
                      aria-label={`Delete ${row.desc}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(row);
                      }}
                    />
                    <button
                      type="button"
                      className="checkbox"
                      data-checked={row.done}
                      aria-label={row.done ? 'Mark as not done' : 'Mark as done'}
                      aria-pressed={row.done}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(row);
                      }}
                    />
                  </span>
                </div>
              ),
            )}

            {section.date &&
              (composingDate === section.date ? (
                <div className="list__composer">
                  <ItemComposer
                    subjects={subjects}
                    date={section.date}
                    onSubmit={(v) => submit(v, null, section.date as string)}
                    onCancel={() => setComposingDate(null)}
                    onCreateSubject={createSubject}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  className="list__new"
                  onClick={() => {
                    setEditingId(null);
                    setComposingDate(section.date);
                  }}
                >
                  + New item on this day
                </button>
              ))}
            </div>
          </DropSection>
        ))}
        {sections.length === 0 && (
          <p className="list__empty">
            {shown.size ? 'Nothing for these subjects.' : 'Nothing planned yet.'}
          </p>
        )}
      </div>
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
