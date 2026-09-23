import { useEffect, useRef, useState } from 'react';
import { usePlanner } from '../../store/plannerStore';
import { useSheets, type ComposeTarget, type ItemTarget } from './sheets';
import { useRowActions } from './rowActions';
import { Sheet } from './Sheet';
import { MobileChip, subjectOf } from './MobileRows';
import { subjectAccent } from '../../lib/color';
import {
  addDays,
  buildWindow,
  dayName,
  dayOfMonth,
  daysBetween,
  shortDate,
  startOfWeek,
  todayISO,
} from '../../lib/dates';
import { spanDates } from '../../lib/recurring';

interface Props {
  target: ItemTarget;
  onClose: () => void;
  onEdit: (target: ComposeTarget) => void;
}

/**
 * One item, in full.
 *
 * The card on the Week clamps its details to two lines; this is where the rest
 * of them are, which is the whole reason a row is tappable at all. The other
 * three things a row needs — done, move, delete — are here too, so the swipe
 * actions are a shortcut to this sheet rather than the only way to reach them.
 */
export function ItemSheet({ target, onClose, onEdit }: Props) {
  const { state, dispatch } = usePlanner();
  const { toast } = useSheets();
  // The same two the swipe actions use, so either route behaves identically.
  const { toggleDone, remove } = useRowActions();
  const { subjects, items, recurring } = state;

  const item = target.kind === 'item' ? items.find((i) => i.id === target.id) : undefined;
  const span = target.kind === 'recurring' ? recurring.find((r) => r.id === target.id) : undefined;
  const record = item ?? span;

  // Deleted from under us — by an undo elsewhere, or a sync once there is one.
  useEffect(() => {
    if (!record) onClose();
  }, [record, onClose]);
  if (!record) return null;

  const subject = subjectOf(subjects, record.subjectId);
  const date = item ? item.date : target.date;
  const done = item ? item.done : (span?.doneDates.includes(target.date) ?? false);

  /* ---- actions ------------------------------------------------------- */

  function moveTo(next: string) {
    if (next === date) {
      onClose();
      return;
    }
    if (item) {
      const from = item.date;
      dispatch({ type: 'item/update', id: item.id, patch: { date: next } });
      toast(`Moved to ${shortDate(next)}`, () =>
        dispatch({ type: 'item/update', id: item.id, patch: { date: from } }),
      );
    } else if (span) {
      /*
       * A span moves whole: the end shifts by the same number of days as the
       * start so the length is kept, and the days already ticked off travel
       * with it — otherwise moving a five-day reading forward would leave its
       * ticks behind on days it no longer covers.
       */
      const delta = daysBetween(span.startDate, next);
      const before = span;
      dispatch({
        type: 'recurring/update',
        id: span.id,
        patch: {
          startDate: addDays(span.startDate, delta),
          endDate: addDays(span.endDate, delta),
          doneDates: span.doneDates.map((d) => addDays(d, delta)),
        },
      });
      toast(`Moved to ${shortDate(next)}`, () =>
        dispatch({
          type: 'recurring/update',
          id: before.id,
          patch: {
            startDate: before.startDate,
            endDate: before.endDate,
            doneDates: before.doneDates,
          },
        }),
      );
    }
    onClose();
  }

  /* ---- body ---------------------------------------------------------- */

  const bandLabel = item
    ? item.type === 'assignment'
      ? 'Assignment'
      : 'Event'
    : 'Recurring';

  const spanLine = span
    ? `${shortDate(span.startDate)} – ${shortDate(span.endDate)} · day ${
        daysBetween(span.startDate, target.date) + 1
      } of ${spanDates(span).length}`
    : '';

  return (
    <Sheet title={bandLabel} subtitle={item ? shortDate(date) : spanLine} onClose={onClose}>
      <div className="m-detail">
        <div className="m-detail__top">
          <MobileChip subject={subject} done={done} />
          {done && <span className="m-detail__done">Done</span>}
        </div>
        <h2 className="m-detail__title" style={{ borderColor: subjectAccent(subject?.hue ?? null) }}>
          {(item ? item.description : span?.title) || 'Untitled'}
        </h2>
        {/* Unclamped: the two-line limit on a card is the reason to open this. */}
        {item?.details && <p className="m-detail__details">{item.details}</p>}
        {item?.time && <p className="m-detail__meta">{item.time}</p>}
      </div>

      <MoveStrip
        current={date}
        label={span ? 'Move span to' : 'Move to'}
        onPick={moveTo}
      />

      <div className="m-sheet__group">
        <button
          type="button"
          className="m-listrow"
          onClick={() => {
            toggleDone(target);
            onClose();
          }}
        >
          <span className="m-listrow__glyph">{done ? '○' : '✓'}</span>
          <span className="m-listrow__title">
            {span
              ? done
                ? `Clear ${dayName(target.date)}`
                : `Mark ${dayName(target.date)} done`
              : done
                ? 'Mark as not done'
                : 'Mark as done'}
          </span>
        </button>
        <button
          type="button"
          className="m-listrow"
          onClick={() =>
            onEdit({ mode: 'edit', kind: target.kind, id: target.id })
          }
        >
          <span className="m-listrow__glyph">✎</span>
          <span className="m-listrow__title">Edit</span>
          <span className="m-listrow__chevron" aria-hidden="true">
            ›
          </span>
        </button>
        <button
          type="button"
          className="m-listrow m-listrow--danger"
          onClick={() => {
            remove(target);
            onClose();
          }}
        >
          <span className="m-listrow__glyph">⌫</span>
          <span className="m-listrow__title">Delete</span>
        </button>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------- move */

/**
 * The week the item is in, as seven tappable days, plus a way out to any other
 * date. Seven covers "tomorrow" and "not until Friday", which is nearly every
 * move anyone makes; the date field is there so the other ones are possible
 * without leaving the sheet.
 */
function MoveStrip({
  current,
  label,
  onPick,
}: {
  current: string;
  label: string;
  onPick: (date: string) => void;
}) {
  const [other, setOther] = useState(false);
  const dateRef = useRef<HTMLInputElement>(null);
  const week = buildWindow(startOfWeek(current), 7);
  const today = todayISO();

  useEffect(() => {
    if (!other) return;
    const el = dateRef.current;
    el?.focus();
    // Safari and Chrome open the picker from a gesture; the focus alone is
    // enough on iOS, where the wheel follows the field.
    el?.showPicker?.();
  }, [other]);

  return (
    <>
      <span className="m-sheet__eyebrow">{label}</span>
      <div className="m-move">
        {week.map((d) => (
          <button
            key={d}
            type="button"
            className="m-move__day"
            data-current={d === current}
            data-today={d === today}
            aria-label={shortDate(d)}
            onClick={() => onPick(d)}
          >
            <span className="m-move__name">{dayName(d).slice(0, 3)}</span>
            <span className="m-move__date">{dayOfMonth(d)}</span>
          </button>
        ))}
      </div>
      {other ? (
        <input
          ref={dateRef}
          type="date"
          className="m-input m-move__other"
          value={current}
          aria-label="Move to another date"
          onChange={(e) => {
            if (e.target.value) onPick(e.target.value);
          }}
        />
      ) : (
        <button type="button" className="m-move__more" onClick={() => setOther(true)}>
          Other date…
        </button>
      )}
    </>
  );
}
