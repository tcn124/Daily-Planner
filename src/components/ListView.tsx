import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePlanner } from '../store/plannerStore';
import { dayName, dayOfMonth, formatSpan, isWithin, monthShort, todayISO } from '../lib/dates';
import { spanDates } from '../lib/recurring';
import { subjectAccent, subjectChipInk } from '../lib/color';
import { uid } from '../store/defaults';
import { startItemDrag, useDropTarget } from '../lib/dnd';
import { TodoStrip } from './TodoStrip';
import { ItemComposer, type ComposerValue } from './ItemComposer';

type Kind = 'assignment' | 'event' | 'recurring';
type GroupBy = 'day' | 'subject';
type SortBy = 'default' | 'time' | 'subject';

interface Row {
  kind: Kind;
  id: string;
  date: string;
  hue: number | null;
  subject: string;
  subjectId: string | null;
  desc: string;
  time: string;
  done: boolean;
  createdAt: number;
}

const PILL_LABEL: Record<Kind, string> = {
  assignment: 'Assignment',
  event: 'Event',
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

const GROUP_CYCLE: GroupBy[] = ['day', 'subject'];
const SORT_CYCLE: SortBy[] = ['default', 'time', 'subject'];
const GROUP_LABEL: Record<GroupBy, string> = { day: 'Day', subject: 'Subject' };
const SORT_LABEL: Record<SortBy, string> = {
  default: 'Sort',
  time: 'Sort: Time',
  subject: 'Sort: Subject',
};

export function ListView() {
  const { state, dispatch } = usePlanner();
  const { subjects, items, recurring, todos } = state;
  const [groupBy, setGroupBy] = useState<GroupBy>('day');
  const [sortBy, setSortBy] = useState<SortBy>('default');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [composingDate, setComposingDate] = useState<string | null>(null);

  const today = todayISO();

  /*
   * The list has no window: it shows every day that has anything on it, from
   * the earliest to the latest, so nothing is ever out of reach. Days with
   * nothing scheduled are simply absent rather than padded in.
   */
  const dates = [
    ...new Set([...items.map((i) => i.date), ...recurring.flatMap(spanDates)]),
  ].sort();
  const lookup = (id: string | null) => subjects.find((s) => s.id === id) ?? null;

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

  function rowsFor(date: string): Row[] {
    const dayItems = items
      .filter((i) => i.date === date)
      .map<Row>((i) => {
        const s = lookup(i.subjectId);
        return {
          kind: i.type,
          id: i.id,
          date,
          hue: s?.hue ?? null,
          subject: s?.name ?? 'No subject',
          subjectId: i.subjectId,
          desc: i.description || 'Untitled',
          time: i.time,
          done: i.done,
          createdAt: i.createdAt,
        };
      });

    const dayRecurring = recurring
      .filter((r) => isWithin(date, r.startDate, r.endDate))
      .map<Row>((r) => {
        const s = lookup(r.subjectId);
        return {
          kind: 'recurring',
          id: r.id,
          date,
          hue: s?.hue ?? null,
          subject: s?.name ?? 'No subject',
          subjectId: r.subjectId,
          desc: r.title || 'Untitled',
          time: '',
          done: r.doneDates.includes(date),
          createdAt: 0,
        };
      });

    return sortRows([...dayItems, ...dayRecurring]);
  }

  const allRows = dates.flatMap(rowsFor);

  /** One section per day, or one per subject across everything. */
  const sections =
    groupBy === 'day'
      ? dates.map((date) => ({
          key: date,
          date: date as string | null,
          title: dayName(date),
          badge: `${monthShort(date)} ${dayOfMonth(date)}`,
          isToday: date === today,
          rows: rowsFor(date),
        }))
      : [...subjects, null]
          .map((s) => ({
            key: s?.id ?? 'none',
            date: null as string | null,
            title: s?.name ?? 'No subject',
            badge: '',
            isToday: false,
            rows: allRows.filter((r) => r.subjectId === (s?.id ?? null)),
          }))
          .filter((s) => s.rows.length > 0);

  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (groupBy !== 'day') return;
    const target = dates.find((d) => d >= today);
    if (!target) return;
    const el = bodyRef.current?.querySelector<HTMLElement>(`[data-date="${target}"]`);
    el?.scrollIntoView({ block: 'start' });
    // Only on first open: later re-renders must not yank the scroll position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      <header className="list__header">
        <div className="list__heading">
          <h1 className="list__title">List</h1>
          <span className="list__sub">
            {dates.length
              ? `${formatSpan([dates[0], dates[dates.length - 1]])} · `
              : ''}
            {allRows.length} item{allRows.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="list__controls">
          <button
            type="button"
            className="btn"
            onClick={() =>
              setGroupBy(
                GROUP_CYCLE[(GROUP_CYCLE.indexOf(groupBy) + 1) % GROUP_CYCLE.length],
              )
            }
          >
            Group: {GROUP_LABEL[groupBy]}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              setSortBy(SORT_CYCLE[(SORT_CYCLE.indexOf(sortBy) + 1) % SORT_CYCLE.length])
            }
          >
            {SORT_LABEL[sortBy]}
          </button>
        </div>
      </header>

      <div className="list__body" ref={bodyRef}>
        {sections.map((section) => (
          <DropSection
            key={section.key}
            date={section.date}
            draggingId={draggingId}
            onDropItem={(id) => onDropItem(id, section)}
          >
            <div
              className={
                section.isToday ? 'list__group list__group--today' : 'list__group'
              }
            >
              <span className="list__group-name">{section.title}</span>
              {section.badge && <span className="list__group-date">{section.badge}</span>}
              {section.isToday && <span className="list__group-today">today</span>}
              <span className="count">{section.rows.length}</span>
            </div>

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
                  <span className="chip list__pill">{PILL_LABEL[row.kind]}</span>
                  <span
                    className="list__subject"
                    style={{ color: subjectChipInk(row.hue) }}
                  >
                    <span
                      className="list__subject-dot"
                      style={{ background: subjectAccent(row.hue) }}
                    />
                    {row.subject}
                  </span>
                  <span className="list__desc">
                    {row.desc}
                    {row.time && <span className="list__time"> · {row.time}</span>}
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
          </DropSection>
        ))}
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
