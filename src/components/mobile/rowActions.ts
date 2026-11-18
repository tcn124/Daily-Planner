import { usePlanner } from '../../store/plannerStore';
import { useSheets, type ItemTarget } from './sheets';
import { shortDate, todayISO } from '../../lib/dates';

/**
 * Done and Delete, with the undo that goes with them.
 *
 * A swipe reaches these and so does the item sheet, and they must behave
 * identically either way — the same toast, the same undo. Keeping them here
 * rather than in each caller is what guarantees that a row deleted by a swipe
 * comes back the same as one deleted from the sheet.
 */
export function useRowActions() {
  const { state, dispatch } = usePlanner();
  const { toast } = useSheets();

  function toggleDone(target: ItemTarget): void {
    if (target.kind === 'item') {
      const item = state.items.find((i) => i.id === target.id);
      if (!item) return;
      dispatch({ type: 'item/toggle', id: item.id });
      toast(item.done ? 'Marked as not done' : 'Marked as done', () =>
        dispatch({ type: 'item/toggle', id: item.id }),
      );
      return;
    }
    const span = state.recurring.find((r) => r.id === target.id);
    if (!span) return;
    const was = span.doneDates.includes(target.date);
    dispatch({ type: 'recurring/toggleDay', id: span.id, date: target.date });
    toast(
      was ? `${shortDate(target.date)} cleared` : `${shortDate(target.date)} done`,
      () => dispatch({ type: 'recurring/toggleDay', id: span.id, date: target.date }),
    );
  }

  function remove(target: ItemTarget): void {
    if (target.kind === 'item') {
      const item = state.items.find((i) => i.id === target.id);
      if (!item) return;
      dispatch({ type: 'item/delete', id: item.id });
      // Restored with its own id and createdAt, so undo puts it back where it
      // was in its band rather than appending a copy.
      toast('Deleted', () => dispatch({ type: 'item/add', item }));
      return;
    }
    const span = state.recurring.find((r) => r.id === target.id);
    if (!span) return;
    dispatch({ type: 'recurring/delete', id: span.id });
    toast('Deleted', () => dispatch({ type: 'recurring/add', item: span }));
  }

  /**
   * Missed items back onto today, one or all of them. The old dates go into
   * the undo, so "Move all to today" is as reversible as a single swipe.
   */
  function moveToToday(ids: string[]): void {
    const today = todayISO();
    const before = ids
      .map((id) => state.items.find((i) => i.id === id))
      .filter((i): i is NonNullable<typeof i> => !!i)
      .map((i) => ({ id: i.id, date: i.date }));
    if (before.length === 0) return;
    for (const { id } of before) dispatch({ type: 'item/update', id, patch: { date: today } });
    toast(before.length === 1 ? 'Moved to today' : `Moved ${before.length} to today`, () => {
      for (const { id, date } of before) dispatch({ type: 'item/update', id, patch: { date } });
    });
  }

  return { toggleDone, remove, moveToToday };
}
