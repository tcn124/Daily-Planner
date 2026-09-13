import { useEffect, useState, type CSSProperties } from 'react';
import { usePlanner } from '../store/plannerStore';
import {
  buildWindow,
  dayName,
  dayOfMonth,
  monthLong,
  todayISO,
  year,
} from '../lib/dates';
import { DEFAULT_BAND_WEIGHTS, uid } from '../store/defaults';
import { DayCell, type ComposerTarget } from './DayCell';
import { RecurringBand } from './RecurringBand';
import { ScratchpadFooter } from './ScratchpadFooter';
import type { ComposerValue } from './ItemComposer';
import { BandResizer } from './BandResizer';
import navPrev from '../assets/nav-prev.svg';

interface Props {
  onOpenSettings: () => void;
}

export function WeekView({ onOpenSettings }: Props) {
  const { state, dispatch } = usePlanner();
  const { subjects, items, recurring, todos, settings } = state;
  const [composer, setComposer] = useState<ComposerTarget | null>(null);

  const window_ = buildWindow(settings.anchorDate, settings.daysVisible);
  const today = todayISO();

  // Arrow keys page the window, but not while typing into the composer.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === 'ArrowLeft') dispatch({ type: 'settings/shift', direction: -1 });
      if (e.key === 'ArrowRight') dispatch({ type: 'settings/shift', direction: 1 });
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
        item: { type: composer.type, date: composer.date, done: false, ...value },
      });
    }
    setComposer(null);
  }

  const cellProps = {
    subjects,
    composer,
    onOpenComposer: setComposer,
    onCloseComposer: () => setComposer(null),
    onSubmit: submitComposer,
    onToggle: (id: string) => dispatch({ type: 'item/toggle', id }),
    onDelete: (id: string) => dispatch({ type: 'item/delete', id }),
    onCreateSubject: createSubject,
  };

  const itemsFor = (date: string, type: 'assignment' | 'event') =>
    items
      .filter((i) => i.date === date && i.type === type)
      .sort((a, b) => a.createdAt - b.createdAt);

  return (
    <div
      className="planner"
      style={{ '--days': settings.daysVisible } as CSSProperties}
    >
      <header className="titlebar">
        <h1 className="titlebar__title">
          {monthLong(settings.anchorDate)}
          <span className="titlebar__year">{year(settings.anchorDate)}</span>
        </h1>
        <div className="titlebar__nav">
          <button
            type="button"
            className="nav-btn nav-btn--prev"
            aria-label="Previous day"
            onClick={() => dispatch({ type: 'settings/shift', direction: -1 })}
          >
            <img src={navPrev} alt="" />
          </button>
          <button
            type="button"
            className="nav-btn nav-btn--today"
            aria-label="Jump to today"
            title="Today"
            onClick={() => dispatch({ type: 'settings/today' })}
          />
          <button
            type="button"
            className="nav-btn nav-btn--next"
            aria-label="Next day"
            onClick={() => dispatch({ type: 'settings/shift', direction: 1 })}
          >
            <img src={navPrev} alt="" />
          </button>
        </div>
      </header>

      <div className="dayhead">
        <div className="dayhead__corner" />
        {window_.map((date) => (
          <div
            key={date}
            className={
              date === today ? 'dayhead__day dayhead__day--today' : 'dayhead__day'
            }
          >
            <span>{dayName(date)}</span>
            <span className="dayhead__date">{dayOfMonth(date)}</span>
          </div>
        ))}
      </div>

      <div className="band band--assignments" style={{ flex: `${settings.bandWeights[0]} 1 0` }}>
        <div className="rail">
          <span className="rail__label">Assignments</span>
          <BandResizer
            index={0}
            bandWeights={settings.bandWeights}
            onBands={(weights) => dispatch({ type: 'settings/bandWeights', weights })}
            onReset={() =>
              dispatch({
                type: 'settings/bandWeights',
                weights: [...DEFAULT_BAND_WEIGHTS] as [number, number, number],
              })
            }
          />
        </div>
        {window_.map((date) => (
          <DayCell
            key={date}
            date={date}
            type="assignment"
            items={itemsFor(date, 'assignment')}
            {...cellProps}
          />
        ))}
      </div>

      <div className="band band--events" style={{ flex: `${settings.bandWeights[1]} 1 0` }}>
        <div className="rail">
          <span className="rail__label">Events</span>
          <BandResizer
            index={1}
            bandWeights={settings.bandWeights}
            onBands={(weights) => dispatch({ type: 'settings/bandWeights', weights })}
            onReset={() =>
              dispatch({
                type: 'settings/bandWeights',
                weights: [...DEFAULT_BAND_WEIGHTS] as [number, number, number],
              })
            }
          />
        </div>
        {window_.map((date) => (
          <DayCell
            key={date}
            date={date}
            type="event"
            items={itemsFor(date, 'event')}
            {...cellProps}
          />
        ))}
      </div>

      <div className="band band--recurring" style={{ flex: `${settings.bandWeights[2]} 1 0` }}>
        <div className="rail">
          <span className="rail__label">Recurring</span>
        </div>
        <RecurringBand
          anchorDate={settings.anchorDate}
          days={settings.daysVisible}
          recurring={recurring}
          subjects={subjects}
          onCreate={(item) => dispatch({ type: 'recurring/add', item })}
          onUpdate={(id, patch) => dispatch({ type: 'recurring/update', id, patch })}
          onDelete={(id) => dispatch({ type: 'recurring/delete', id })}
          onToggle={(id) => dispatch({ type: 'recurring/toggle', id })}
          onCreateSubject={createSubject}
        />
      </div>


      <ScratchpadFooter
        todos={todos}
        onAddTodo={(text) => dispatch({ type: 'todo/add', text })}
        onToggleTodo={(id) => dispatch({ type: 'todo/toggle', id })}
        onDeleteTodo={(id) => dispatch({ type: 'todo/delete', id })}
        onOpenList={() => dispatch({ type: 'settings/view', view: 'list' })}
        onOpenSettings={onOpenSettings}
        onQuickAdd={() =>
          setComposer({
            date: window_.includes(today) ? today : window_[0],
            type: 'assignment',
            itemId: null,
          })
        }
      />
    </div>
  );
}
