import { useEffect } from 'react';
import { usePlanner } from '../../store/plannerStore';
import { useSheets, type ComposeTarget, type ItemTarget } from './sheets';
import { useRowActions } from './rowActions';
import { Sheet } from './Sheet';
import { TickTrack, subjectOf } from './MobileRows';
import { DayStrip } from './DayStrip';
import { SubjectSquare } from '../SubjectSquare';
import { addDays, dayName, daysBetween, shortDate } from '../../lib/dates';
import { recurringProgress } from '../../lib/recurring';

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

  /** What "Move to" picks: the item's day, or the day a span starts on. */
  const moveFrom = span ? span.startDate : date;

  function moveTo(next: string) {
    if (next === moveFrom) {
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

  // Events are folded in with assignments; the stored type is left alone.
  const kindLabel = item ? 'Assignment' : 'Recurring';
  const progress = span ? recurringProgress(span, target.date) : null;
  const subtitle = span && progress
    ? `${shortDate(span.startDate)} – ${shortDate(span.endDate)} · day ${progress.dayIndex} of ${progress.total}`
    : shortDate(date);

  return (
    <Sheet title={kindLabel} subtitle={subtitle} onClose={onClose}>
      <div className="m-detail">
        <span className="m-detail__subject">
          <SubjectSquare hue={subject?.hue ?? null} />
          {subject?.name ?? 'No subject'}
          {item?.time && <span className="m-detail__time">{item.time}</span>}
        </span>
        <h2 className="m-detail__title" data-done={done}>
          {(item ? item.description : span?.title) || 'Untitled'}
        </h2>
        {/* Unclamped: the two-line limit on a card is the reason to open this. */}
        {item?.details && <p className="m-detail__details">{item.details}</p>}
        {progress && (
          <span className="m-detail__progress">
            <TickTrack ticks={progress.ticks} wide />
            {progress.doneCount} of {progress.total} done
          </span>
        )}
      </div>

      <span className="m-label">{span ? 'Move span to' : 'Move to'}</span>
      <DayStrip weekOf={moveFrom} selected={[moveFrom]} onPick={moveTo} />

      <div className="m-actions">
        <button
          type="button"
          className="m-action"
          onClick={() => {
            toggleDone(target);
            onClose();
          }}
        >
          <span className="m-action__glyph" aria-hidden="true">{done ? '○' : '✓'}</span>
          <span className="m-action__label">
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
          className="m-action"
          onClick={() => onEdit({ mode: 'edit', kind: target.kind, id: target.id })}
        >
          <span className="m-action__glyph" aria-hidden="true">✎</span>
          <span className="m-action__label">Edit</span>
          <span className="m-action__chevron" aria-hidden="true">›</span>
        </button>
        <button
          type="button"
          className="m-action m-action--danger"
          onClick={() => {
            remove(target);
            onClose();
          }}
        >
          <span className="m-action__glyph" aria-hidden="true">⌫</span>
          <span className="m-action__label">{span ? 'Delete recurring' : 'Delete'}</span>
        </button>
      </div>
    </Sheet>
  );
}
