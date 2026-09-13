import { usePlanner } from '../store/plannerStore';
import {
  buildWindow,
  dayName,
  dayOfMonth,
  isWithin,
  monthLong,
  monthShort,
  todayISO,
} from '../lib/dates';
import { subjectFill, subjectLabel } from '../lib/color';
import { ScratchpadFooter } from './ScratchpadFooter';

interface Props {
  onOpenSettings: () => void;
}

type Kind = 'assignment' | 'event' | 'recurring';

interface Row {
  kind: Kind;
  id: string;
  hue: number | null;
  subject: string;
  desc: string;
  time: string;
  done: boolean;
}

const PILL_LABEL: Record<Kind, string> = {
  assignment: 'Assignment',
  event: 'Event',
  recurring: 'Recurring',
};

export function ListView({ onOpenSettings }: Props) {
  const { state, dispatch } = usePlanner();
  const { subjects, items, recurring, todos, settings } = state;

  const window_ = buildWindow(settings.anchorDate, settings.daysVisible);
  const today = todayISO();

  // "24 – 30", or "30 – Sep 5" when the window straddles two months.
  const first = window_[0];
  const last = window_[window_.length - 1];
  const dayRange =
    monthShort(first) === monthShort(last)
      ? `${dayOfMonth(first)} – ${dayOfMonth(last)}`
      : `${dayOfMonth(first)} – ${monthShort(last)} ${dayOfMonth(last)}`;
  const lookup = (id: string | null) => subjects.find((s) => s.id === id) ?? null;

  function rowsFor(date: string): Row[] {
    const dayItems = items
      .filter((i) => i.date === date)
      .sort((a, b) => {
        // Assignments before events, then creation order.
        if (a.type !== b.type) return a.type === 'assignment' ? -1 : 1;
        return a.createdAt - b.createdAt;
      })
      .map<Row>((i) => {
        const s = lookup(i.subjectId);
        return {
          kind: i.type,
          id: i.id,
          hue: s?.hue ?? null,
          subject: s?.name ?? 'No subject',
          desc: i.description || 'Untitled',
          time: i.time,
          done: i.done,
        };
      });

    const dayRecurring = recurring
      .filter((r) => isWithin(date, r.startDate, r.endDate))
      .map<Row>((r) => {
        const s = lookup(r.subjectId);
        return {
          kind: 'recurring',
          id: r.id,
          hue: s?.hue ?? null,
          subject: s?.name ?? 'No subject',
          desc: r.title || 'Untitled',
          time: '',
          done: r.done,
        };
      });

    return [...dayItems, ...dayRecurring];
  }

  function toggle(row: Row) {
    dispatch(
      row.kind === 'recurring'
        ? { type: 'recurring/toggle', id: row.id }
        : { type: 'item/toggle', id: row.id },
    );
  }

  return (
    <div className="list">
      <header className="list__header">
        <h1 className="list__title">
          {monthLong(settings.anchorDate)}
          <span className="list__range">{dayRange}</span>
        </h1>
        <button
          type="button"
          className="pill"
          onClick={() => dispatch({ type: 'settings/view', view: 'grid' })}
        >
          Weekly
        </button>
      </header>

      <div className="list__body">
        {window_.map((date) => {
          const rows = rowsFor(date);
          return (
            <section key={date}>
              <h2
                className={
                  date === today ? 'list__day list__day--today' : 'list__day'
                }
              >
                <span>{dayName(date)}</span>
                <span className="list__day-date">{dayOfMonth(date)}</span>
              </h2>

              {rows.length === 0 ? (
                <p className="list__empty">Nothing scheduled</p>
              ) : (
                rows.map((row) => (
                  <div
                    className={row.done ? 'list__row list__row--done' : 'list__row'}
                    key={row.id}
                  >
                    <span
                      className="type-pill"
                      style={{
                        background: subjectFill(row.hue),
                        color: subjectLabel(row.hue),
                      }}
                    >
                      {PILL_LABEL[row.kind]}
                    </span>
                    <span
                      className="list__subject"
                      style={{ color: subjectLabel(row.hue) }}
                    >
                      {row.subject}
                    </span>
                    <span className="list__desc">
                      {row.desc}
                      {row.time && <div className="list__time">{row.time}</div>}
                    </span>
                    <button
                      type="button"
                      className="checkbox list__checkbox"
                      data-checked={row.done}
                      aria-label={row.done ? 'Mark as not done' : 'Mark as done'}
                      aria-pressed={row.done}
                      onClick={() => toggle(row)}
                    />
                  </div>
                ))
              )}
            </section>
          );
        })}
      </div>

      <ScratchpadFooter
        todos={todos}
        onAddTodo={(text) => dispatch({ type: 'todo/add', text })}
        onToggleTodo={(id) => dispatch({ type: 'todo/toggle', id })}
        onDeleteTodo={(id) => dispatch({ type: 'todo/delete', id })}
        onOpenList={() => dispatch({ type: 'settings/view', view: 'grid' })}
        onOpenSettings={onOpenSettings}
        onQuickAdd={() => dispatch({ type: 'settings/view', view: 'grid' })}
        listLabel="weekly"
      />
    </div>
  );
}
