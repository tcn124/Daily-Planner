import { usePlanner } from '../../store/plannerStore';
import { missedItems } from '../../lib/missed';
import { lateLong } from '../../lib/format';
import { todayISO } from '../../lib/dates';
import { SubjectSquare } from '../SubjectSquare';
import { Sheet } from './Sheet';
import { subjectOf } from './MobileRows';
import { useSheets } from './sheets';
import { useRowActions } from './rowActions';

/**
 * Everything overdue, from the Missed row under the Week and List headers
 * (frame 5g). Each row can go to today on its own or open its item sheet; the
 * footer moves the lot. Every move lands an undo rather than asking first.
 */
export function MissedSheet({ onClose }: { onClose: () => void }) {
  const { state } = usePlanner();
  const { openItem } = useSheets();
  const { moveToToday } = useRowActions();
  const today = todayISO();
  const missed = missedItems(state.items, today);

  return (
    <Sheet
      title="Missed"
      subtitle={String(missed.length)}
      onClose={onClose}
      action={
        missed.length > 0
          ? {
              label: 'Move all to today',
              onClick: () => {
                moveToToday(missed.map((i) => i.id));
                onClose();
              },
            }
          : undefined
      }
      hideCancel
      footnote="Done items never count as missed. Tick one off here and it leaves the list."
    >
      {missed.length === 0 ? (
        <p className="m-sheet__note">Nothing overdue. Nice.</p>
      ) : (
        <div className="m-rows">
          {missed.map((item) => {
            const subject = subjectOf(state.subjects, item.subjectId);
            return (
              <div key={item.id} className="m-missedrow">
                <SubjectSquare hue={subject?.hue ?? null} />
                <span className="m-missedrow__body">
                  <span className="m-missedrow__title">{item.description || 'Untitled'}</span>
                  <span className="m-missedrow__meta">
                    {subject?.name ?? 'No subject'} ·{' '}
                    <span className="m-late">{lateLong(item.date, today)}</span>
                  </span>
                </span>
                <button type="button" className="m-pill" onClick={() => moveToToday([item.id])}>
                  Today
                </button>
                <button
                  type="button"
                  className="m-more"
                  aria-label={`More for ${item.description || 'this item'}`}
                  onClick={() => openItem({ kind: 'item', id: item.id, date: item.date })}
                >
                  ⋯
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}
